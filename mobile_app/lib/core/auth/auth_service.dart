import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile_app/core/api/api_client.dart';
import 'package:mobile_app/core/constants/api_constants.dart';

class AuthService {
  final ApiClient _apiClient;
  final _storage = const FlutterSecureStorage();

  AuthService(this._apiClient);

  Future<bool> login(String username, String password) async {
    try {
      final response = await _apiClient.post(
        ApiConstants.login,
        data: {'username': username, 'password': password},
      );

      if (response.statusCode == 200) {
        final accessToken = response.data['access'];
        final refreshToken = response.data['refresh'];

        await _storage.write(key: 'access_token', value: accessToken);
        await _storage.write(key: 'refresh_token', value: refreshToken);
        return true;
      }
      return false;
    } on DioException catch (e) {
      return false;
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
  }

  Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: 'access_token');
    return token != null;
  }
}
