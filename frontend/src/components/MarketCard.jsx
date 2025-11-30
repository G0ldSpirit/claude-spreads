import './MarketCard.css';

function MarketCard({ market, orderbooks, onClick }) {
  const getTokenOrderbook = (tokenId) => {
    return orderbooks[tokenId];
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'N/A';
    const cents = (price * 100).toFixed(1);
    return `${cents}¢`;
  };

  const getMarketStatus = () => {
    if (market.closed) return 'Closed';
    if (market.active) return 'Active';
    return 'Unknown';
  };

  const getSpreadData = () => {
    if (!market.tokens || market.tokens.length === 0) {
      return null;
    }

    const yesToken = market.tokens.find(t => t.outcome === 'Yes') || market.tokens[0];
    const orderbook = getTokenOrderbook(yesToken.token_id);

    if (!orderbook || !orderbook.spreadMetrics) {
      return null;
    }

    return {
      ...orderbook.spreadMetrics,
      tokenId: yesToken.token_id
    };
  };

  const spreadData = getSpreadData();

  return (
    <div className="market-card" onClick={onClick}>
      <div className="market-header">
        <span className={`market-status ${market.active ? 'active' : 'closed'}`}>
          {getMarketStatus()}
        </span>
        {market.end_date_iso && (
          <span className="market-end-date">
            {new Date(market.end_date_iso).toLocaleDateString()}
          </span>
        )}
      </div>

      <h3 className="market-question">{market.question}</h3>

      <div className="market-metrics">
        <div className="metric">
          <span className="metric-label">Volume</span>
          <span className="metric-value">
            ${formatNumber(market.volume)}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Liquidity</span>
          <span className="metric-value">
            ${formatNumber(market.liquidity)}
          </span>
        </div>
      </div>

      {spreadData && (
        <div className="spread-section">
          <div className="spread-header">
            <h4>Spread Metrics</h4>
          </div>

          <div className="price-row">
            <div className="price-item bid">
              <span className="price-label">Best Bid</span>
              <span className="price-value">{formatPrice(spreadData.bestBid)}</span>
              <span className="price-size">Size: {formatNumber(spreadData.bidSize)}</span>
            </div>
            <div className="price-item ask">
              <span className="price-label">Best Ask</span>
              <span className="price-value">{formatPrice(spreadData.bestAsk)}</span>
              <span className="price-size">Size: {formatNumber(spreadData.askSize)}</span>
            </div>
          </div>

          <div className="spread-metrics">
            <div className="spread-metric">
              <span className="spread-label">Spread</span>
              <span className="spread-value">
                {formatPrice(spreadData.spread)}
              </span>
            </div>
            <div className="spread-metric">
              <span className="spread-label">Mid Price</span>
              <span className="spread-value mid-price">
                {formatPrice((spreadData.bestBid + spreadData.bestAsk) / 2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {!spreadData && (
        <div className="no-orderbook">
          <p>No order book data available</p>
        </div>
      )}

      <div className="market-footer">
        <button className="view-details-btn">
          View Order Book →
        </button>
      </div>
    </div>
  );
}

export default MarketCard;
