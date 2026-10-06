from django.db import IntegrityError, transaction
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import MixSlip, Pit, User, Yard
from pits.rules import (
    RuleError,
    assert_can_add_sample,
    assert_can_set_status,
    current_slip,
    latest_ph,
)

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()

VOID_ROLES = {"mixchief", "admin"}


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class SlipIn(Schema):
    fat_percent: float


def slip_json(slip: MixSlip) -> dict:
    return {
        "id": slip.id,
        "seq": slip.seq,
        "fatPercent": slip.fat_percent,
        "createdBy": slip.created_by,
        "createdAt": slip.created_at.isoformat() if slip.created_at else None,
        "voidedBy": slip.voided_by or None,
        "voidedAt": slip.voided_at.isoformat() if slip.voided_at else None,
    }


def pit_json(pit: Pit) -> dict:
    slip = current_slip(pit)
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "currentSlip": None if slip is None else {"seq": slip.seq, "fatPercent": slip.fat_percent},
    }


def get_pit_or_404(pit_id: int) -> Pit:
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    return pit


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
    yard = Yard.objects.prefetch_related("pits__samples", "pits__slips").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = get_pit_or_404(pit_id)
    try:
        assert_can_add_sample(pit)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = get_pit_or_404(pit_id)
    try:
        assert_can_set_status(pit, payload.status)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)


@api.get("/pits/{pit_id}/slips", auth=auth)
def list_slips(request, pit_id: int):
    pit = get_pit_or_404(pit_id)
    slips = pit.slips.order_by("-seq", "-id")
    return {"pit": pit.code, "slips": [slip_json(s) for s in slips]}


@api.post("/pits/{pit_id}/slips", auth=auth)
def add_slip(request, pit_id: int, payload: SlipIn):
    pit = get_pit_or_404(pit_id)
    if payload.fat_percent <= 0:
        raise HttpError(400, "油脂须为正数")
    try:
        with transaction.atomic():
            last = pit.slips.order_by("-seq").only("seq").first()
            seq = 1 if last is None else last.seq + 1
            slip = pit.slips.create(
                seq=seq,
                fat_percent=payload.fat_percent,
                created_by=request.auth.username,
            )
    except IntegrityError:
        raise HttpError(409, "配比单号撞车，请刷新后重开")
    return slip_json(slip)


@api.post("/slips/{slip_id}/void", auth=auth)
def void_slip(request, slip_id: int):
    if request.auth.role not in VOID_ROLES:
        raise HttpError(403, "作废归配料长")
    slip = MixSlip.objects.filter(id=slip_id).first()
    if slip is None:
        raise HttpError(404, "配比单不存在")
    if slip.voided_at is not None:
        raise HttpError(400, "该单已作废")
    slip.voided_at = timezone.now()
    slip.voided_by = request.auth.username
    slip.save(update_fields=["voided_at", "voided_by"])
    return slip_json(slip)
