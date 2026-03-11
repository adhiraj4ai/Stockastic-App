import 'package:flutter/material.dart';
import 'package:mobile_app/core/auth/auth_service.dart';

enum AuthStatus { authenticated, unauthenticated, authenticating }

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  AuthStatus _status = AuthStatus.unauthenticated;

  AuthProvider(this._authService) {
    _checkLoginStatus();
  }

  AuthStatus get status => _status;

  Future<void> _checkLoginStatus() async {
    final loggedIn = await _authService.isLoggedIn();
    _status = loggedIn ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    _status = AuthStatus.authenticating;
    notifyListeners();

    final success = await _authService.login(username, password);
    _status = success ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
    return success;
  }

  Future<void> logout() async {
    await _authService.logout();
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
