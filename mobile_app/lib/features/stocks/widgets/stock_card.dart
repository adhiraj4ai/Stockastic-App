import 'package:flutter/material.dart';
import 'package:mobile_app/features/stocks/models/stock_model.dart';

class StockCard extends StatelessWidget {
  final Stock stock;
  final VoidCallback? onTap;

  const StockCard({super.key, required this.stock, this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = stock.change >= 0 ? Colors.green : Colors.red;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      child: ListTile(
        onTap: onTap,
        title: Text(
          stock.ticker,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(
          stock.companyName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              'Rs ${stock.currentPrice.toStringAsFixed(2)}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(
              '${stock.change >= 0 ? "+" : ""}${stock.change.toStringAsFixed(2)} (${stock.percentChange.toStringAsFixed(2)}%)',
              style: TextStyle(color: color, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
