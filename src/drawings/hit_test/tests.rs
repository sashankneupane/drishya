use crate::drawings::hit_test::HitToleranceProfile;

#[test]
fn tolerance_profile_default_is_positive() {
    let p = HitToleranceProfile::default();
    assert!(p.hover_px > 0.0);
    assert!(p.select_px > 0.0);
    assert!(p.drag_px > 0.0);
}
