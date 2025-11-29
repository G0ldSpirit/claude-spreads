import { useEffect, useRef } from 'react';
import './OrderBookModal.css';

function OrderBookModal({ market, orderbooks, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const formatPrice = (price) => {
    return `$${parseFloat(price).toFixed(4)}`;
  };

  const formatSize = (size) => {
    return parseFloat(size).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const renderOrderBook = (token) => {
    const orderbook = orderbooks[token.token_id];

    if (!orderbook) {
      return (
        <div className="no-orderbook-data">
          <p>No order book data available for this token</p>
        </div>
      );
    }

    const { bids = [], asks = [], spreadMetrics } = orderbook;
    const maxRows = Math.max(bids.length, asks.length, 10);

    return (
      <div className="orderbook-container">
        <div className="token-header">
          <h3>{token.outcome}</h3>
          {spreadMetrics && (
            <div className="spread-info">
              <div className="spread-item">
                <span className="label">Spread:</span>
                <span className="value">{formatPrice(spreadMetrics.spread)}</span>
              </div>
              <div className="spread-item">
                <span className="label">Mid Price:</span>
                <span className="value mid-price">{formatPrice((spreadMetrics.bestBid + spreadMetrics.bestAsk) / 2)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="orderbook-tables">
          <div className="orderbook-table bids-table">
            <div className="table-header">
              <h4>Bids (Buy Orders)</h4>
            </div>
            <div className="table-columns">
              <span>Price</span>
              <span>Size</span>
            </div>
            <div className="table-body">
              {Array.from({ length: maxRows }).map((_, index) => {
                const bid = bids[index];
                return (
                  <div
                    key={`bid-${index}`}
                    className={`table-row ${bid ? 'has-data' : 'empty'}`}
                  >
                    {bid ? (
                      <>
                        <span className="price">{formatPrice(bid.price)}</span>
                        <span className="size">{formatSize(bid.size)}</span>
                      </>
                    ) : (
                      <>
                        <span className="price">-</span>
                        <span className="size">-</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="orderbook-table asks-table">
            <div className="table-header">
              <h4>Asks (Sell Orders)</h4>
            </div>
            <div className="table-columns">
              <span>Price</span>
              <span>Size</span>
            </div>
            <div className="table-body">
              {Array.from({ length: maxRows }).map((_, index) => {
                const ask = asks[index];
                return (
                  <div
                    key={`ask-${index}`}
                    className={`table-row ${ask ? 'has-data' : 'empty'}`}
                  >
                    {ask ? (
                      <>
                        <span className="price">{formatPrice(ask.price)}</span>
                        <span className="size">{formatSize(ask.size)}</span>
                      </>
                    ) : (
                      <>
                        <span className="price">-</span>
                        <span className="size">-</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <div className="modal-header">
          <div className="modal-title">
            <h2>{market.question}</h2>
            <div className="market-info">
              <span className="info-item">
                Volume: ${parseFloat(market.volume || 0).toLocaleString()}
              </span>
              <span className="info-item">
                Liquidity: ${parseFloat(market.liquidity || 0).toLocaleString()}
              </span>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {market.tokens && market.tokens.length > 0 ? (
            market.tokens.map((token) => (
              <div key={token.token_id} className="token-section">
                {renderOrderBook(token)}
              </div>
            ))
          ) : (
            <div className="no-tokens">
              <p>No tokens available for this market</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderBookModal;
