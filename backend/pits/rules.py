"""鞣坑门槛：放液看最近酸碱度 3.5～5.0；登记酸碱须持现行配比单且油脂 3～8。"""

from pits.models import Pit, RatioOrder

MIN_PH = 3.5
MAX_PH = 5.0
MIN_GREASE = 3.0
MAX_GREASE = 8.0


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def current_ratio_order(pit: Pit) -> RatioOrder | None:
    """现行有效配比单：未作废、单号最大的一张。"""
    return pit.ratio_orders.filter(voided_at__isnull=True).order_by("-order_no", "-id").first()


def assert_can_record_sample(pit: Pit) -> None:
    order = current_ratio_order(pit)
    if order is None:
        raise RuleError("该坑无现行加脂配比单，不能登记酸碱度")
    grease = order.grease_percent
    if grease < MIN_GREASE or grease > MAX_GREASE:
        raise RuleError(f"现行配比单油脂 {grease:g}% 不在 {MIN_GREASE:g}～{MAX_GREASE:g}，不能登记酸碱度")


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")
