"""鞣坑门槛两条：

1. 放液：最近一次浸液酸碱度须在 3.5～5.0（改坑态只看这条，不看配比单）。
2. 登记酸碱度：本坑须有现行配比单，且油脂百分落在 3～8（含）。
"""

from pits.models import MixSlip, Pit

MIN_PH = 3.5
MAX_PH = 5.0
MIN_FAT = 3.0
MAX_FAT = 8.0


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def current_slip(pit: Pit) -> MixSlip | None:
    """本坑现行（未作废）配比单，取单号最大的一张。"""
    slips = [s for s in pit.slips.all() if s.voided_at is None]
    if not slips:
        return None
    return max(slips, key=lambda s: (s.seq, s.id))


def assert_can_add_sample(pit: Pit) -> None:
    slip = current_slip(pit)
    if slip is None:
        raise RuleError("该坑无现行配比单，不能登记酸碱度")
    if slip.fat_percent < MIN_FAT or slip.fat_percent > MAX_FAT:
        raise RuleError(f"现行配比单油脂 {slip.fat_percent} 不在 {MIN_FAT}～{MAX_FAT}，不能登记酸碱度")


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
