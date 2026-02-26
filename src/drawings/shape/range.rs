use crate::drawings::{
    commands::DrawingCommand,
    hit_test::{RectCorner, RectEdge, RectHitTarget},
    types::{DateTimeRange, Drawing, PriceRange, TimeRange, DEFAULT_DRAWING_LAYER},
};

pub fn price_range_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> PriceRange {
    PriceRange {
        id: 0,
        start_index,
        end_index,
        top_price: start_price.max(end_price),
        bottom_price: start_price.min(end_price),
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn time_range_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> TimeRange {
    TimeRange {
        id: 0,
        start_index: start_index.min(end_index),
        end_index: start_index.max(end_index),
        top_price: start_price.max(end_price),
        bottom_price: start_price.min(end_price),
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn date_time_range_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DateTimeRange {
    DateTimeRange {
        id: 0,
        start_index,
        end_index,
        top_price: start_price.max(end_price),
        bottom_price: start_price.min(end_price),
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn price_range_preview(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> Drawing {
    Drawing::PriceRange(price_range_from_points(
        start_index,
        start_price,
        end_index,
        end_price,
    ))
}

pub fn time_range_preview(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> Drawing {
    Drawing::TimeRange(time_range_from_points(
        start_index,
        start_price,
        end_index,
        end_price,
    ))
}

pub fn date_time_range_preview(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> Drawing {
    Drawing::DateTimeRange(date_time_range_from_points(
        start_index,
        start_price,
        end_index,
        end_price,
    ))
}

pub fn add_price_range_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let range = price_range_from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddPriceRange {
        start_index: range.start_index,
        end_index: range.end_index,
        top_price: range.top_price,
        bottom_price: range.bottom_price,
    }
}

pub fn add_time_range_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let range = time_range_from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddTimeRange {
        start_index: range.start_index,
        end_index: range.end_index,
        top_price: range.top_price,
        bottom_price: range.bottom_price,
    }
}

pub fn add_date_time_range_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let range = date_time_range_from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddDateTimeRange {
        start_index: range.start_index,
        end_index: range.end_index,
        top_price: range.top_price,
        bottom_price: range.bottom_price,
    }
}

pub fn resize_price_range(
    range: &mut PriceRange,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    resize_rect_bounds(
        &mut range.start_index,
        &mut range.end_index,
        &mut range.top_price,
        &mut range.bottom_price,
        target,
        world_x,
        price,
    )
}

pub fn resize_date_time_range(
    range: &mut DateTimeRange,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    resize_rect_bounds(
        &mut range.start_index,
        &mut range.end_index,
        &mut range.top_price,
        &mut range.bottom_price,
        target,
        world_x,
        price,
    )
}

pub fn resize_time_range(
    range: &mut TimeRange,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    resize_rect_bounds(
        &mut range.start_index,
        &mut range.end_index,
        &mut range.top_price,
        &mut range.bottom_price,
        target,
        world_x,
        price,
    )
}

fn resize_rect_bounds(
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
