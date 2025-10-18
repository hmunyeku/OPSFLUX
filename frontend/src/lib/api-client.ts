/**
 * API Client - Axios-like interface using fetch
 * Compatible with email templates and other API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'

interface RequestConfig {
  headers?: Record<string, string>
  params?: Record<string, unknown>
}

interface ApiResponse<T = unknown> {
  data: T
  status: number
  statusText: string
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('access_token')
  }

  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const url = new URL(`${API_URL}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }
    return url.toString()
  }

  private async request<T = unknown>(
    method: string,
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const token = this.getToken()
    const url = this.buildUrl(endpoint, config?.params)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config?.headers,
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data)
    }

    try {
      const response = await fetch(url, options)

      let responseData: unknown
      const contentType = response.headers.get('content-type')

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      if (!response.ok) {
        const error = new Error(
          (responseData as { detail?: string })?.detail ||
          String(responseData) ||
          'Request failed'
        ) as Error & { response?: { data: unknown; status: number; statusText: string } }
        error.response = {
          data: responseData,
          status: response.status,
          statusText: response.statusText,
        }
        throw error
      }

      return {
        data: responseData as T,
        status: response.status,
        statusText: response.statusText,
      }
    } catch (error) {
      // Re-throw with response data if available
      const err = error as Error & { response?: { data: unknown; status: number; statusText: string }; message: string }
      if (err.response) {
        throw err
      }
      // Network or other errors
      const networkErr = new Error(err.message || 'Network error') as Error & { response: { data: { detail: string }; status: number; statusText: string } }
      networkErr.response = {
        data: { detail: err.message || 'Network error' },
        status: 0,
        statusText: 'Network Error',
      }
      throw networkErr
    }
  }

  async get<T = unknown>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, config)
  }

  async post<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, data, config)
  }

  async put<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, data, config)
  }

  async patch<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', endpoint, data, config)
  }

  async delete<T = unknown>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, config)
  }
}

export const apiClient = new ApiClient()
