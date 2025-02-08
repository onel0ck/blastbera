# Blast Era Token Eligibility Checker

Simple and efficient tool to check wallet addresses for Blast Era Token eligibility.

## Contact & Support

- Telegram Channel: [unluck_1l0ck](https://t.me/unluck_1l0ck)
- Telegram: [@one_lock](https://t.me/one_lock)
- Twitter/X: [@1l0ck](https://twitter.com/1l0ck)

## Features

- Multi-threaded address checking
- SOCKS5 proxy support
- Progress tracking
- Detailed logging
- Results export to separate files

## Installation

```bash
git clone https://github.com/onel0ck/blastbera.git
cd blastbera
npm install
```

## Configuration

1. Create `addresses.txt` file with wallet addresses (one per line)
   - Addresses can be with or without '0x' prefix
2. Create `proxies.txt` file with SOCKS5 proxies (one per line)
   - Format: `socks5://username:password@host:port`

## Usage

```bash
node main.js
```

### Output Files

- `eligible.txt` - List of eligible addresses
- `eligible_detailed.txt` - Eligible addresses with allocation amounts
- `errors.txt` - Addresses that failed during checking
