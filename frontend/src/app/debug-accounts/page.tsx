'use client';

import { useEffect, useState } from 'react';
import { serviceAccountsApi, usersApi, dataListsApi, API_URL, healthCheck, apiClient } from '@/lib/api';

export default function DebugAccountsPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const debugAccounts = async () => {
      const testResults: any = {};

      // Test 1: Health check
      try {
        console.log('🔍 Testing health check...');
        const isHealthy = await healthCheck();
        testResults.healthCheck = {
          status: isHealthy ? 'success' : 'error',
          healthy: isHealthy
        };
      } catch (error: any) {
        testResults.healthCheck = {
          status: 'error',
          error: error.message
        };
      }

      // Test 2: Direct fetch to health endpoint
      try {
        console.log('🔍 Testing direct health fetch...');
        const healthResponse = await fetch(`${API_URL}/health`);
        const healthData = await healthResponse.json();
        testResults.directHealth = {
          status: 'success',
          data: healthData,
          statusCode: healthResponse.status
        };
      } catch (error: any) {
        testResults.directHealth = {
          status: 'error',
          error: error.message
        };
      }

      // Test 3: Direct axios call to accounts
      try {
        console.log('🔍 Testing direct axios accounts (switched to apiClient)...');
        // Originally axios, but refactored to use apiClient for stability
        const directResponse = await apiClient.request('/api/v1/accounts/');

        testResults.directAccounts = {
          status: 'success',
          data: directResponse.data,
          count: Array.isArray(directResponse.data) ? directResponse.data.length : 0,
          statusCode: directResponse.status
        };
        if (directResponse.error) throw new Error(directResponse.error);
      } catch (error: any) {
        testResults.directAccounts = {
          status: 'error',
          error: error.message,
          response: error.response?.data,
          statusCode: error.response?.status
        };
      }

      // Test 4: API instance call to accounts
      try {
        console.log('🔍 Testing API instance accounts...');
        const apiResponse = await serviceAccountsApi.list();
        testResults.apiAccounts = {
          status: 'success',
          data: apiResponse.data,
          count: Array.isArray(apiResponse.data) ? apiResponse.data.length : 0,
          statusCode: apiResponse.status
        };
      } catch (error: any) {
        testResults.apiAccounts = {
          status: 'error',
          error: error.message,
          response: error.response?.data,
          statusCode: error.response?.status
        };
      }

      // Test 5: Users API
      try {
        console.log('🔍 Testing users API...');
        const usersResponse = await usersApi.list();
        testResults.usersApi = {
          status: 'success',
          data: usersResponse.data,
          count: Array.isArray(usersResponse.data) ? usersResponse.data.length : 0,
          statusCode: usersResponse.status
        };
      } catch (error: any) {
        testResults.usersApi = {
          status: 'error',
          error: error.message,
          response: error.response?.data,
          statusCode: error.response?.status
        };
      }

      // Test 6: Data Lists API
      try {
        console.log('🔍 Testing data lists API...');
        const dataListsResponse = await dataListsApi.list();
        testResults.dataListsApi = {
          status: 'success',
          data: dataListsResponse.data,
          count: Array.isArray(dataListsResponse.data) ? dataListsResponse.data.length : 0,
          statusCode: dataListsResponse.status
        };
      } catch (error: any) {
        testResults.dataListsApi = {
          status: 'error',
          error: error.message,
          response: error.response?.data,
          statusCode: error.response?.status
        };
      }

      setResults(testResults);
      setLoading(false);
    };

    debugAccounts();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Debugging Accounts Loading...</h1>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Accounts Loading</h1>
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-900">API Configuration</h2>
          <p className="text-blue-800">API URL: <code className="bg-blue-100 px-2 py-1 rounded">{API_URL}</code></p>
        </div>

        <div className="grid gap-4">
          {Object.entries(results).map(([key, result]: [string, any]) => (
            <div key={key} className={`border rounded p-4 ${result.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}>
              <h3 className="font-semibold capitalize text-lg">
                {key.replace(/([A-Z])/g, ' $1')}
                {result.status === 'success' ? ' ✅' : ' ❌'}
              </h3>
              <div className="mt-2">
                <p><strong>Status:</strong>
                  <span className={`ml-2 px-2 py-1 rounded text-sm ${result.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                    {result.status}
                  </span>
                </p>

                {result.statusCode && (
                  <p><strong>Status Code:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{result.statusCode}</code></p>
                )}

                {result.count !== undefined && (
                  <p><strong>Count:</strong> <span className="font-mono text-lg">{result.count}</span></p>
                )}

                {result.healthy !== undefined && (
                  <p><strong>Healthy:</strong> <span className={`px-2 py-1 rounded ${result.healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{result.healthy ? 'Yes' : 'No'}</span></p>
                )}

                {result.error && (
                  <div className="mt-2">
                    <p><strong>Error:</strong> <span className="text-red-600">{result.error}</span></p>
                  </div>
                )}

                {result.response && (
                  <div className="mt-2">
                    <p><strong>Response:</strong></p>
                    <pre className="bg-gray-100 p-2 rounded text-xs mt-1 max-h-32 overflow-auto">
                      {JSON.stringify(result.response, null, 2)}
                    </pre>
                  </div>
                )}

                {result.data && (
                  <div className="mt-2">
                    <p><strong>Data Preview:</strong></p>
                    <pre className="bg-gray-100 p-2 rounded text-xs mt-1 max-h-40 overflow-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">Troubleshooting Steps:</h3>
          <ul className="text-yellow-700 space-y-1 text-sm">
            <li>• If health check fails: Backend is not running</li>
            <li>• If direct calls work but API instance fails: API configuration issue</li>
            <li>• If all calls fail: Network/CORS issue</li>
            <li>• If calls succeed but count is 0: Database is empty</li>
            <li>• If status code is 500: Backend server error</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
