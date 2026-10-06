import math
from typing import Optional

from django.db import IntegrityError, transaction
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, RatioOrder, User, Yard
from pits.rules import (
    RuleError,
    assert_can_record_sample,
    assert_can_set_status,
    current_ratio_order,
    latest_ph,
)

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()

# 作废归配料长；场主 admin 亦可
VOID_ROLES = {"admin", "batcher"}


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class RatioOrderIn(Schema):
    greasePercent: float
    orderNo: Optional[int] = None  # 缺省时服务端顺排，从 1 起


def pit_json(pit: Pit) -> dict:
    order = current_ratio_order(pit)
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "activeRatio": None
        if order is None
        else {"orderNo": order.order_no, "greasePercent": order.grease_percent},
    }


def order_json(order: RatioOrder) -> dict:
    return {
        "id": order.id,
        "pitId": order.pit_id,
        "orderNo": order.order_no,
        "greasePercent": order.grease_percent,
        "createdBy": order.created_by,
        "createdAt": order.created_at.isoformat(),
        "voidedBy": order.voided_by or None,
        "voidedAt": order.voided_at.isoformat() if order.voided_at else None,
        "active": order.voided_at is None,
    }


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        assert_can_record_sample(pit)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        assert_can_set_status(pit, payload.status)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)


@api.get("/pits/{pit_id}/ratio-orders", auth=auth)
def list_ratio_orders(request, pit_id: int):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    return [order_json(o) for o in pit.ratio_orders.order_by("-order_no", "-id")]


@api.post("/pits/{pit_id}/ratio-orders", auth=auth)
def create_ratio_order(request, pit_id: int, payload: RatioOrderIn):
    grease = payload.greasePercent
    if not math.isfinite(grease) or grease <= 0:
        raise HttpError(400, "油脂百分须为正数")
    if payload.orderNo is not None and payload.orderNo < 1:
        raise HttpError(400, "单号须为从 1 起的正整数")
    try:
        with transaction.atomic():
            pit = Pit.objects.select_for_update().filter(id=pit_id).first()
            if pit is None:
                raise HttpError(404, "坑不存在")
            order_no = payload.orderNo
            if order_no is None:
                last = pit.ratio_orders.order_by("-order_no").first()
                order_no = 1 if last is None else last.order_no + 1
            order = pit.ratio_orders.create(
                order_no=order_no, grease_percent=grease, created_by=request.auth.username
            )
    except IntegrityError:
        raise HttpError(409, f"本坑已有现行的 {payload.orderNo} 号配比单")
    return order_json(order)


@api.post("/ratio-orders/{order_id}/void", auth=auth)
def void_ratio_order(request, order_id: int):
    if request.auth.role not in VOID_ROLES:
        raise HttpError(403, "作废须配料长")
    order = RatioOrder.objects.filter(id=order_id).first()
    if order is None:
        raise HttpError(404, "配比单不存在")
    if order.voided_at is not None:
        raise HttpError(400, "该单已作废")
    order.voided_at = timezone.now()
    order.voided_by = request.auth.username
    order.save(update_fields=["voided_at", "voided_by"])
    return order_json(order)
