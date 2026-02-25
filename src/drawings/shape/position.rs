use crate::drawings::{
    commands::DrawingCommand,
    hit_test::{RectCorner, RectEdge, RectHitTarget},
    types::{Drawing, LongPosition, ShortPosition, DEFAULT_DRAWING_LAYER},
};

pub fn long_from_anchor(world_x: f32, entry_price: f64, price_span: f64) -> LongPosition {
    LongPosition {
        id: 0,
        start_index: world_x - 6.0,
        end_index: world_x + 20.0,
        entry_price,
        stop_price: entry_price - price_span * 0.06,
        target_price: entry_price + price_span * 0.1,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn long_from_points(
    start_index: f32,
    entry_price: f64,
    end_index: f32,
    second_price: f64,
) -> LongPosition {
    let delta = (second_price - entry_price).abs().max(1e-6);
    let (stop_price, target_price) = if second_price >= entry_price {
        (entry_price - delta * 0.5, second_price)
    } else {
        (second_price, entry_price + delta * 2.0)
    };

    LongPosition {
        id: 0,
        start_index,
        end_index,
        entry_price,
        stop_price,
        target_price,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn short_from_anchor(world_x: f32, entry_price: f64, price_span: f64) -> ShortPosition {
    ShortPosition {
        id: 0,
        start_index: world_x - 6.0,
        end_index: world_x + 20.0,
        entry_price,
        stop_price: entry_price + price_span * 0.06,
        target_price: entry_price - price_span * 0.1,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn short_from_points(
    start_index: f32,
    entry_price: f64,
    end_index: f32,
    second_price: f64,
) -> ShortPosition {
    let delta = (second_price - entry_price).abs().max(1e-6);
    let (stop_price, target_price) = if second_price <= entry_price {
        (entry_price + delta * 0.5, second_price)
    } else {
        (second_price, entry_price - delta * 2.0)
    };

    ShortPosition {
        id: 0,
        start_index,
        end_index,
        entry_price,
        stop_price,
        target_price,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn long_preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::LongPosition(long_from_points(start_index, start_price, end_index, end_price))
}

pub fn short_preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::ShortPosition(short_from_points(start_index, start_price, end_index, end_price))
}

pub fn add_long_command_from_anchor(world_x: f32, entry_price: f64, price_span: f64) -> DrawingCommand {
    let long = long_from_anchor(world_x, entry_price, price_span);
    DrawingCommand::AddLongPosition {
        start_index: long.start_index,
        end_index: long.end_index,
        entry_price: long.entry_price,
        stop_price: long.stop_price,
        target_price: long.target_price,
    }
}

pub fn add_long_command_from_points(
    start_index: f32,
    entry_price: f64,
    end_index: f32,
    second_price: f64,
) -> DrawingCommand {
    let long = long_from_points(start_index, entry_price, end_index, second_price);
    DrawingCommand::AddLongPosition {
        start_index: long.start_index,
        end_index: long.end_index,
        entry_price: long.entry_price,
        stop_price: long.stop_price,
        target_price: long.target_price,
    }
}

pub fn add_short_command_from_anchor(world_x: f32, entry_price: f64, price_span: f64) -> DrawingCommand {
    let short = short_from_anchor(world_x, entry_price, price_span);
    DrawingCommand::AddShortPosition {
        start_index: short.start_index,
        end_index: short.end_index,
        entry_price: short.entry_price,
        stop_price: short.stop_price,
        target_price: short.target_price,
    }
}

pub fn add_short_command_from_points(
    start_index: f32,
    entry_price: f64,
    end_index: f32,
    second_price: f64,
) -> DrawingCommand {
    let short = short_from_points(start_index, entry_price, end_index, second_price);
    DrawingCommand::AddShortPosition {
        start_index: short.start_index,
        end_index: short.end_index,
        entry_price: short.entry_price,
        stop_price: short.stop_price,
        target_price: short.target_price,
    }
}

pub fn resize_long(
    item: &mut LongPosition,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    let mut top = item.target_price;
    let mut bottom = item.stop_price;
    let next_target = apply_rect_resize(
        &mut item.start_index,
        &mut item.end_index,
        &mut top,
        &mut bottom,
        target,
        world_x,
        price,
    );
    item.target_price = top;
    item.stop_price = bottom;
    item.entry_price = item.entry_price.clamp(item.stop_price, item.target_price);
    next_target
}

pub fn resize_short(
    item: &mut ShortPosition,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    let mut top = item.stop_price;
    let mut bottom = item.target_price;
    let next_target = apply_rect_resize(
        &mut item.start_index,
        &mut item.end_index,
        &mut top,
        &mut bottom,
        target,
        world_x,
        price,
    );
    item.stop_price = top;
    item.target_price = bottom;
    item.entry_price = item.entry_price.clamp(item.target_price, item.stop_price);
    next_target
}

fn apply_rect_resize(
    start_index: &mut f32,
    end_index: &mut f32,
    top_price: &mut f64,
    bottom_price: &mut f64,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    let mut target = target;

    match target {
        RectHitTarget::Inside => {}
        RectHitTarget::Edge(edge) => match edge {
            RectEdge::Top => *top_price = price,
            RectEdge::Right => *end_index = world_x,
            RectEdge::Bottom => *bottom_price = price,
            RectEdge::Left => *start_index = world_x,
        },
        RectHitTarget::Corner(corner) => match corner {
            RectCorner::TopLeft => {
                *start_index = world_x;
                *top_price = price;
            }
            RectCorner::TopRight => {
                *end_index = world_x;
                *top_price = price;
            }
            RectCorner::BottomRight => {
                *end_index = world_x;
                *bottom_price = price;
            }
            RectCorner::BottomLeft => {
                *start_index = world_x;
                *bottom_price = price;
            }
        },
    }

    if *start_index > *end_index {
        std::mem::swap(start_index, end_index);
        target = flip_resize_target_x(target);
    }
    if *top_price < *bottom_price {
        std::mem::swap(top_price, bottom_price);
        target = flip_resize_target_y(target);
    }

    target
}

fn flip_resize_target_x(target: RectHitTarget) -> RectHitTarget {
    match target {
        RectHitTarget::Inside => RectHitTarget::Inside,
        RectHitTarget::Edge(edge) => RectHitTarget::Edge(match edge {
            RectEdge::Left => RectEdge::Right,
            RectEdge::Right => RectEdge::Left,
            RectEdge::Top => RectEdge::Top,
            RectEdge::Bottom => RectEdge::Bottom,
        }),
        RectHitTarget::Corner(corner) => RectHitTarget::Corner(match corner {
            RectCorner::TopLeft => RectCorner::TopRight,
            RectCorner::TopRight => RectCorner::TopLeft,
            RectCorner::BottomLeft => RectCorner::BottomRight,
            RectCorner::BottomRight => RectCorner::BottomLeft,
        }),
    }
}

fn flip_resize_target_y(target: RectHitTarget) -> RectHitTarget {
    match target {
        RectHitTarget::Inside => RectHitTarget::Inside,
        RectHitTarget::Edge(edge) => RectHitTarget::Edge(match edge {
            RectEdge::Top => RectEdge::Bottom,
            RectEdge::Bottom => RectEdge::Top,
            RectEdge::Left => RectEdge::Left,
            RectEdge::Right => RectEdge::Right,
        }),
        RectHitTarget::Corner(corner) => RectHitTarget::Corner(match corner {
            RectCorner::TopLeft => RectCorner::BottomLeft,
            RectCorner::TopRight => RectCorner::BottomRight,
            RectCorner::BottomLeft => RectCorner::TopLeft,
            RectCorner::BottomRight => RectCorner::TopRight,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_resize_crossing_left_edge_flips_to_right() {
        let mut item = LongPosition {
            id: 1,
            start_index: 60.0,
            end_index: 100.0,
            entry_price: 5.0,
            stop_price: 0.0,
            target_price: 10.0,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
        };

        let target = resize_long(
            &mut item,
            RectHitTarget::Edge(RectEdge::Left),
            120.0,
            8.0,
        );

        assert_eq!(target, RectHitTarget::Edge(RectEdge::Right));
        assert_eq!(item.start_index, 100.0);
        assert_eq!(item.end_index, 120.0);
    }
}
