class Stock {
  final String ticker;
  final String companyName;
  final double currentPrice;
  final double change;
  final double percentChange;

  Stock({
    required this.ticker,
    required this.companyName,
    required this.currentPrice,
    required this.change,
    required this.percentChange,
  });

  factory Stock.fromJson(Map<String, dynamic> json) {
    return Stock(
      ticker: json['ticker'] ?? '',
      companyName: json['company_name'] ?? '',
      currentPrice: (json['last_price'] ?? 0.0).toDouble(),
      change: (json['change'] ?? 0.0).toDouble(),
      percentChange: (json['percent_change'] ?? 0.0).toDouble(),
    );
  }
}

class MarketSummary {
  final List<Stock> gainers;
  final List<Stock> losers;
  final List<Stock> mostActive;

  MarketSummary({
    required this.gainers,
    required this.losers,
    required this.mostActive,
  });

  factory MarketSummary.fromJson(Map<String, dynamic> json) {
    return MarketSummary(
      gainers: (json['gainers'] as List? ?? [])
          .map((e) => Stock.fromJson(e))
          .toList(),
      losers: (json['losers'] as List? ?? [])
          .map((e) => Stock.fromJson(e))
          .toList(),
      mostActive: (json['most_active'] as List? ?? [])
          .map((e) => Stock.fromJson(e))
          .toList(),
    );
  }
}
