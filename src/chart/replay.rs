use super::Chart;

impl Chart {
    pub fn replay_play(&mut self) {
        if self.replay.cursor_ts.is_none() {
            self.replay.cursor_ts = self.candles.first().map(|c| c.ts);
        }
        self.replay.playing = true;
    }

    pub fn replay_pause(&mut self) {
        self.replay.playing = false;
    }

    pub fn replay_stop(&mut self) {
        self.replay.playing = false;
        self.replay.cursor_ts = None;
    }

    pub fn replay_seek_ts(&mut self, ts: i64) {
        self.replay.cursor_ts = Some(ts);
    }

    pub fn replay_step_bar(&mut self) -> Option<i64> {
        let next = match self.replay.cursor_ts {
            None => self.candles.first().map(|c| c.ts),
            Some(current) => self
                .candles
                .iter()
                .find(|c| c.ts > current)
                .map(|c| c.ts)
                .or(Some(current)),
        };
        self.replay.cursor_ts = next;
        next
    }

    pub fn replay_step_event(&mut self) -> Option<i64> {
        let next = match self.replay.cursor_ts {
            None => self.events.events().first().map(|e| e.ts),
            Some(current) => self
                .events
                .next_after(current)
                .map(|e| e.ts)
                .or(Some(current)),
        };
        self.replay.cursor_ts = next;
        next
    }

    pub fn replay_tick(&mut self) -> Option<i64> {
        if !self.replay.playing {
            return self.replay.cursor_ts;
        }
        let before = self.replay.cursor_ts;
        let next = self.replay_step_bar();
        if next == before {
            if let Some(current) = before {
                if self.candles.last().map(|c| c.ts <= current).unwrap_or(true) {
                    self.replay.playing = false;
                }
            }
        }
        next
    }

    pub fn replay_state(&self) -> crate::replay::ReplayState {
        self.replay
    }
}

#[cfg(test)]
mod tests {
    use crate::types::Candle;

    use super::Chart;

    fn candle(ts: i64, close: f64) -> Candle {
        Candle {
            ts,
            open: close,
            high: close + 1.0,
            low: close - 1.0,
            close,
            volume: 1.0,
        }
    }

    #[test]
    fn replay_step_event_moves_to_next_event_timestamp() {
        let mut chart = Chart::new(800.0, 400.0);
        chart.set_data(vec![candle(100, 1.0), candle(200, 2.0)]);
        chart.set_events(vec![
            crate::events::ChartEvent {
                event_id: "a".into(),
                ts: 120,
                kind: crate::events::ChartEventKind::Signal,
                side: None,
                price: None,
                text: None,
                meta: None,
            },
            crate::events::ChartEvent {
                event_id: "b".into(),
                ts: 180,
                kind: crate::events::ChartEventKind::Entry,
                side: None,
                price: None,
                text: None,
                meta: None,
            },
        ]);

        assert_eq!(chart.replay_step_event(), Some(120));
        assert_eq!(chart.replay_step_event(), Some(180));
        assert_eq!(chart.replay_step_event(), Some(180));
    }
}
