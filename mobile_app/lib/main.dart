import 'package:flutter/material.dart';
import 'package:mobile_app/core/api/api_client.dart';
import 'package:mobile_app/core/auth/auth_service.dart';
import 'package:mobile_app/features/auth/providers/auth_provider.dart';
import 'package:mobile_app/features/auth/screens/login_screen.dart';
import 'package:mobile_app/features/stocks/providers/stock_provider.dart';
import 'package:mobile_app/features/stocks/screens/market_summary_screen.dart';
import 'package:mobile_app/features/stocks/screens/stock_search_screen.dart';
import 'package:provider/provider.dart';

void main() {
  final apiClient = ApiClient();
  final authService = AuthService(apiClient);

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider(authService)),
        ChangeNotifierProvider(create: (_) => StockProvider(apiClient)),
      ],
      child: const StockasticApp(),
    ),
  );
}

class StockasticApp extends StatelessWidget {
  const StockasticApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Stockastic',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.deepPurple,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (auth.status == AuthStatus.authenticated) {
            return const HomeScreen();
          } else {
            return const LoginScreen();
          }
        },
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stockastic'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const StockSearchScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AuthProvider>().logout(),
          ),
        ],
      ),
      body: const MarketSummaryScreen(),
    );
  }
}
