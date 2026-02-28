use crate::drawings::{
    commands::DrawingCommand,
    hit_test::{RectCorner, RectEdge, RectHitTarget},
    types::{Drawing, DrawingStyle, Rectangle, DEFAULT_DRAWING_LAYER},
};

pub fn from_anchor(world_x: f32, price: f64, price_span: f64) -> Rectangle {
    let bar_half_width = 8.0f32;
    let half_height = price_span * 0.06;
    Rectangle {
        id: 0,
        start_index: world_x - bar_half_width,
        end_index: world_x + bar_half_width,
        top_price: price + half_height,
        bottom_price: price - half_height,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> Rectangle {
    Rectangle {
        id: 0,
        start_index,
        end_index,
        top_price: start_price.max(end_price),
        bottom_price: start_price.min(end_price),
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::Rectangle(from_points(start_index, start_price, end_index, end_price))
}

pub fn add_command_from_anchor(world_x: f32, price: f64, price_span: f64) -> DrawingCommand {
    let rect = from_anchor(world_x, price, price_span);
    DrawingCommand::AddRectangle {
        start_index: rect.start_index,
        end_index: rect.end_index,
        top_price: rect.top_price,
        bottom_price: rect.bottom_price,
    }
}

pub fn add_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let rect = from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddRectangle {
        start_index: rect.start_index,
        end_index: rect.end_index,
        top_price: rect.top_price,
        bottom_price: rect.bottom_price,
    }
}

pub fn resize(
    rect: &mut Rectangle,
    target: RectHitTarget,
    world_x: f32,
    price: f64,
) -> RectHitTarget {
    resize_generic(
        &mut rect.start_index,
        &mut rect.end_index,
        &mut rect.top_price,
        &mut rect.bottom_price,
        target,
        world_x,
        price,
    )
}

pub fn resize_generic(
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
    fn crossing_left_edge_flips_to_right_edge() {
        let mut rect = Rectangle {
            id: 1,
            start_index: 60.0,
            end_index: 100.0,
            top_price: 10.0,
            bottom_price: 0.0,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        };

        let target = resize(&mut rect, RectHitTarget::Edge(RectEdge::Left), 120.0, 8.0);

        assert_eq!(target, RectHitTarget::Edge(RectEdge::Right));
        assert_eq!(rect.start_index, 100.0);
        assert_eq!(rect.end_index, 120.0);
    }
}
