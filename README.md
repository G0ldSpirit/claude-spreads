# 📊 Polymarket Live Spreads

A full-stack JavaScript web application that displays Polymarket prediction markets with real-time bid-ask spreads calculated from order book data.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## 🎯 Features

- **Real-time Market Data**: Fetches active prediction markets from Polymarket's Gamma API
- **Order Book Integration**: Retrieves live order book data from Polymarket's CLOB API
- **Spread Calculations**: Automatically calculates and displays bid-ask spreads
  - Absolute spread (best ask - best bid)
  - Percentage spread relative to mid-price
- **Market Cards**: Clean, professional cards showing:
  - Market question
  - Current prices (best bid/ask)
  - Volume and liquidity metrics
  - Spread metrics
- **Order Book Visualization**: Detailed view with separate tables for bids and asks
- **Market Filtering**: Filter markets by status (active/closed/all)
- **Auto-refresh**: Configurable automatic updates every 10 seconds
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Color-coded UI**: Green for bids, red for asks

## 🏗️ Architecture

### Backend (Node.js + Express)

- RESTful API built with Express
- Proxy endpoints for Polymarket APIs
- Server-side spread calculation
- CORS enabled for frontend communication

### Frontend (React + Vite)

- Modern React with hooks
- Vite for fast development and building
- Component-based architecture
- CSS modules for styling

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## 🚀 Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd claude-spreads
```

2. **Install dependencies**

```bash
npm install
```

This will install dependencies for both frontend and backend workspaces.

## 🎮 Usage

### Development Mode

Start both frontend and backend in development mode:

```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- Frontend development server on `http://localhost:3000`

### Production Mode

1. **Build the frontend**

```bash
npm run build
```

2. **Start the backend server**

```bash
npm start
```

The backend will serve the built frontend files.

## 📁 Project Structure

```
claude-spreads/
├── backend/
│   ├── server.js           # Express server with API endpoints
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MarketCard.jsx        # Market card component
│   │   │   ├── MarketCard.css
│   │   │   ├── OrderBookModal.jsx    # Order book modal
│   │   │   └── OrderBookModal.css
│   │   ├── App.jsx                    # Main app component
│   │   ├── App.css
│   │   ├── main.jsx                   # React entry point
│   │   └── index.css                  # Global styles
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json            # Root package with workspaces
└── README.md
```

## 🔌 API Endpoints

### Backend API

#### `GET /api/markets`

Fetches active markets from Polymarket.

**Query Parameters:**
- `active` (boolean): Filter for active markets
- `closed` (boolean): Filter for closed markets
- `limit` (number): Maximum number of markets to return (default: 50)

**Response:** Array of market objects

#### `GET /api/orderbook/:tokenId`

Fetches order book for a specific token.

**Response:**
```json
{
  "bids": [{"price": "0.52", "size": "100"}],
  "asks": [{"price": "0.54", "size": "150"}],
  "spreadMetrics": {
    "bestBid": 0.52,
    "bestAsk": 0.54,
    "spread": 0.02,
    "spreadPercentage": 3.77,
    "bidSize": 100,
    "askSize": 150
  }
}
```

#### `POST /api/orderbooks`

Fetches multiple order books at once.

**Request Body:**
```json
{
  "tokenIds": ["token1", "token2", "token3"]
}
```

**Response:** Array of order book objects

#### `GET /api/market/:conditionId`

Fetches details for a specific market.

**Response:** Market object with full details

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-29T..."
}
```

## 🎨 UI Components

### MarketCard

Displays market information in a card format:
- Market status (Active/Closed)
- Question
- Volume and liquidity
- Best bid/ask prices
- Spread metrics
- Click to view full order book

### OrderBookModal

Modal dialog showing:
- Full order book for each token
- Separate tables for bids and asks
- Color-coded prices (green for bids, red for asks)
- Spread information
- Scrollable order lists

## 🔧 Configuration

### Backend Configuration

Create a `.env` file in the `backend` directory:

```env
PORT=3001
```

### Frontend Configuration

The frontend is configured to proxy API requests to the backend in development mode. See `frontend/vite.config.js`.

## 🌐 External APIs Used

- **Polymarket Gamma API**: `https://gamma-api.polymarket.com`
  - Used for fetching market data
- **Polymarket CLOB API**: `https://clob.polymarket.com`
  - Used for fetching order book data

## 📊 Spread Calculation

The spread is calculated as:

```
Absolute Spread = Best Ask Price - Best Bid Price
Mid Price = (Best Bid + Best Ask) / 2
Spread Percentage = (Absolute Spread / Mid Price) × 100
```

## 🎯 Key Features Explained

### Auto-refresh

The application automatically refreshes market data every 10 seconds when enabled. Users can:
- Pause/resume auto-refresh
- Manually trigger refresh
- See the last update timestamp

### Market Filtering

Filter markets by:
- **All**: Show all markets
- **Active**: Only active markets
- **Closed**: Only closed markets

### Responsive Grid

Markets are displayed in a responsive grid that adapts to screen size:
- Desktop: Multiple columns
- Tablet: 2 columns
- Mobile: Single column

## 🛠️ Development

### Running Backend Only

```bash
npm run dev:backend
```

### Running Frontend Only

```bash
npm run dev:frontend
```

### Building Frontend

```bash
npm run build
```

## 📝 Notes

- The application uses Polymarket's public APIs
- Order book data is fetched in real-time
- Spread calculations are performed server-side for accuracy
- All monetary values are displayed in USD

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [Polymarket](https://polymarket.com) for providing the prediction market APIs
- Built with React, Vite, Express, and Node.js
