import 'package:flutter/material.dart';
import 'package:mobile_app/features/stocks/providers/stock_provider.dart';
import 'package:mobile_app/features/stocks/widgets/stock_card.dart';
import 'package:provider/provider.dart';

class StockSearchScreen extends StatefulWidget {
  const StockSearchScreen({super.key});

  @override
  State<StockSearchScreen> createState() => _StockSearchScreenState();
}

class _StockSearchScreenState extends State<StockSearchScreen> {
  final _searchController = TextEditingController();
  List<dynamic> _results = [];
  bool _isSearching = false;

  void _onSearchChanged() async {
    if (_searchController.text.length < 2) {
      setState(() => _results = []);
      return;
    }

    setState(() => _isSearching = true);
    final provider = context.read<StockProvider>();
    final results = await provider.searchStocks(_searchController.text);
    setState(() {
      _results = results;
      _isSearching = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search stocks...',
            border: InputBorder.none,
          ),
          onChanged: (_) => _onSearchChanged(),
        ),
      ),
      body: _isSearching
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) => StockCard(
                stock: _results[index],
                onTap: () {
                  // Navigate to Detail
                },
              ),
            ),
    );
  }
}
