use crate::drawings::{
    commands::DrawingCommand,
    hit_test::{RectCorner, RectEdge, RectHitTarget},
    types::{Drawing, FibRetracement, DEFAULT_DRAWING_LAYER},
};

const FIB_LEVELS: [f64; 8] = [-0.618, -0.272, 0.0, 0.382, 0.5, 0.618, 0.786, 1.0];

pub fn levels() -> &'static [f64] {
    &FIB_LEVELS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_fib(start_price: f64, end_price: f64) -> FibRetracement {
        FibRetracement {
            id: 1,
            start_index: 10.0,
            end_index: 20.0,
            start_price,
            end_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
        }
    }

    #[test]
    fn level_price_maps_zero_and_one_to_anchors() {
        let fib = sample_fib(110.0, 100.0);
        assert_eq!(level_price(&fib, 0.0), 100.0);
        assert_eq!(level_price(&fib, 1.0), 110.0);
    }

    #[test]
    fn negative_level_extends_in_move_direction_down_move() {
        let fib = sample_fib(110.0, 100.0);
        let ext = level_price(&fib, -0.272);
        assert!(ext < fib.end_price);
    }

    #[test]
    fn negative_level_extends_in_move_direction_up_move() {
        let fib = sample_fib(100.0, 110.0);
        let ext = level_price(&fib, -0.272);
        assert!(ext > fib.end_price);
    }
}

pub fn from_anchor(world_x: f32, price: f64, price_span: f64) -> FibRetracement {
    FibRetracement {
        id: 0,
        start_index: world_x - 8.0,
        end_index: world_x + 28.0,
        start_price: price + price_span * 0.06,
        end_price: price - price_span * 0.06,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn from_points(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> FibRetracement {
    FibRetracement {
        id: 0,
        start_index,
        end_index,
        start_price,
        end_price,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn add_command_from_anchor(world_x: f32, price: f64, price_span: f64) -> DrawingCommand {
    let fib = from_anchor(world_x, price, price_span);
    DrawingCommand::AddFibRetracement {
        start_index: fib.start_index,
        end_index: fib.end_index,
        start_price: fib.start_price,
        end_price: fib.end_price,
    }
}

pub fn add_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let fib = from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddFibRetracement {
        start_index: fib.start_index,
        end_index: fib.end_index,
        start_price: fib.start_price,
        end_price: fib.end_price,
    }
}

pub fn preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::FibRetracement(from_points(start_index, start_price, end_index, end_price))
}

pub fn resize(fib: &mut FibRetracement, target: RectHitTarget, world_x: f32, price: f64) -> RectHitTarget {
    let mut target = target;

    match target {
        RectHitTarget::Inside => {}
        RectHitTarget::Edge(edge) => match edge {
            RectEdge::Top => fib.start_price = price,
            RectEdge::Right => fib.end_index = world_x,
            RectEdge::Bottom => fib.end_price = price,
            RectEdge::Left => fib.start_index = world_x,
        },
        RectHitTarget::Corner(corner) => match corner {
            RectCorner::TopLeft => {
                fib.start_index = world_x;
                fib.start_price = price;
            }
            RectCorner::TopRight => {
                fib.end_index = world_x;
                fib.start_price = price;
            }
            RectCorner::BottomRight => {
                fib.end_index = world_x;
                fib.end_price = price;
            }
            RectCorner::BottomLeft => {
                fib.start_index = world_x;
                fib.end_price = price;
            }
        },
    }

    if fib.start_index > fib.end_index {
        std::mem::swap(&mut fib.start_index, &mut fib.end_index);
        target = flip_resize_target_x(target);
    }

    target
}

pub fn level_price(fib: &FibRetracement, level: f64) -> f64 {
    fib.end_price + (fib.start_price - fib.end_price) * level
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
