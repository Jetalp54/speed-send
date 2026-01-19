'use client';

import { useEffect, useState } from 'react';
import { serviceAccountsApi, usersApi, dataListsApi, API_URL, apiClient } from '@/lib/api';

export default function TestApiPage() {
  const [results, setResults] = useState<any>({});

  useEffect(() => {
    const testApis = async () => {
      const testResults: any = {};

      // Test 1: Direct axios call
      try {
        console.log('Testing direct axios call (via apiClient)...');
        const directResponse = await apiClient.request('/api/v1/accounts/');
        if (directResponse.error) throw new Error(directResponse.error);
        testResults.directAxios = {
          status: 'success',
          data: directResponse.data,
          count: Array.isArray(directResponse.data) ? directResponse.data.length : 0
        };
      } catch (error: any) {
        testResults.directAxios = {
          status: 'error',
          error: error.message,
          response: error.response?.data
        };
      }

      // Test 2: API instance call
      try {
        console.log('Testing API instance call...');
        const apiResponse = await serviceAccountsApi.list();
        testResults.apiInstance = {
          status: 'success',
          data: apiResponse.data,
          count: Array.isArray(apiResponse.data) ? apiResponse.data.length : 0
        };
      } catch (error: any) {
        testResults.apiInstance = {
          status: 'error',
          error: error.message,
          response: error.response?.data
        };
      }

      // Test 3: Users API
      try {
        console.log('Testing users API...');
        const usersResponse = await usersApi.list();
        testResults.usersApi = {
          status: 'success',
          data: usersResponse.data,
          count: Array.isArray(usersResponse.data) ? usersResponse.data.length : 0
        };
      } catch (error: any) {
        testResults.usersApi = {
          status: 'error',
          error: error.message,
          response: error.response?.data
        };
      }

      // Test 4: Data Lists API
      try {
        console.log('Testing data lists API...');
        const dataListsResponse = await dataListsApi.list();
        testResults.dataListsApi = {
          status: 'success',
          data: dataListsResponse.data,
          count: Array.isArray(dataListsResponse.data) ? dataListsResponse.data.length : 0
        };
      } catch (error: any) {
        testResults.dataListsApi = {
          status: 'error',
          error: error.message,
          response: error.response?.data
        };
      }

      setResults(testResults);
    };

    testApis();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">API Test Results</h1>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">API URL: {API_URL}</h2>
        </div>

        <div className="grid gap-4">
          {Object.entries(results).map(([key, result]: [string, any]) => (
            <div key={key} className="border rounded p-4">
              <h3 className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3>
              <div className="mt-2">
                <p><strong>Status:</strong> {result.status}</p>
                {result.status === 'success' ? (
                  <div>
                    <p><strong>Count:</strong> {result.count}</p>
                    <pre className="bg-gray-100 p-2 rounded text-xs mt-2">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <p><strong>Error:</strong> {result.error}</p>
                    {result.response && (
                      <pre className="bg-red-100 p-2 rounded text-xs mt-2">
                        {JSON.stringify(result.response, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
