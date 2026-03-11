import 'package:flutter/material.dart';
import 'package:mobile_app/core/api/api_client.dart';
import 'package:mobile_app/core/constants/api_constants.dart';
import 'package:mobile_app/features/stocks/models/stock_model.dart';

class StockProvider extends ChangeNotifier {
  final ApiClient _apiClient;
  MarketSummary? _marketSummary;
  bool _isLoading = false;

  StockProvider(this._apiClient);

  MarketSummary? get marketSummary => _marketSummary;
  bool get isLoading => _isLoading;

  Future<void> fetchMarketSummary() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _apiClient.get(
        '/stocks/summary/',
      ); // Using the endpoint from urls.py
      if (response.statusCode == 200) {
        _marketSummary = MarketSummary.fromJson(response.data);
      }
    } catch (e) {
      // Handle error
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<List<Stock>> searchStocks(String query) async {
    try {
      final response = await _apiClient.get(
        '/stocks/search/',
        queryParameters: {'q': query},
      );
      if (response.statusCode == 200) {
        return (response.data as List).map((e) => Stock.fromJson(e)).toList();
      }
    } catch (e) {
      // Handle error
    }
    return [];
  }
}
