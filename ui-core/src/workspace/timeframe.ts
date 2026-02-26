import axios from 'axios';

export async function fetchTimeframeData(symbol, timeframe) {
  const baseUrl = 'https://api.binance.com/api/v3/klines';
  const interval = timeframe; // Use the timeframe directly

  try {
    const response = await axios.get(baseUrl, {
      params: {
        symbol: symbol.toUpperCase(),
        interval: interval,
        limit: 500, // Fetch the last 500 candles
      },
    });

    return response.data.map((candle) => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6],
    }));
  } catch (error) {
    console.error('Error fetching timeframe data:', error);
    throw error;
  }
}