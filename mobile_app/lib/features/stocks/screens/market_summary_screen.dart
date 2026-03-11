import 'package:flutter/material.dart';
import 'package:mobile_app/features/stocks/providers/stock_provider.dart';
import 'package:mobile_app/features/stocks/widgets/stock_card.dart';
import 'package:provider/provider.dart';

class MarketSummaryScreen extends StatefulWidget {
  const MarketSummaryScreen({super.key});

  @override
  State<MarketSummaryScreen> createState() => _MarketSummaryScreenState();
}

class _MarketSummaryScreenState extends State<MarketSummaryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<StockProvider>().fetchMarketSummary());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<StockProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          final summary = provider.marketSummary;
          if (summary == null) {
            return const Center(child: Text('Failed to load market summary'));
          }

          return RefreshIndicator(
            onRefresh: provider.fetchMarketSummary,
            child: ListView(
              children: [
                _buildSection('Top Gainers', summary.gainers),
                _buildSection('Top Losers', summary.losers),
                _buildSection('Most Active', summary.mostActive),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSection(String title, List<dynamic> stocks) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Text(
            title,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: stocks.length,
          itemBuilder: (context, index) => StockCard(stock: stocks[index]),
        ),
      ],
    );
  }
}
