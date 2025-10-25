/**
 * API client for Scheduled Tasks management (Celery Beat)
 */

import { apiClient } from './client';

// Types matching backend models
export interface ScheduledTask {
  id: string;
  name: string;
  task_name: string;
  description?: string;
  schedule_type: 'cron' | 'interval';

  // Cron fields
  cron_minute?: string;
  cron_hour?: string;
  cron_day_of_week?: string;
  cron_day_of_month?: string;
  cron_month_of_year?: string;

  // Interval fields
  interval_value?: number;
  interval_unit?: 'seconds' | 'minutes' | 'hours' | 'days';

  // Task arguments
  args: any[];
  kwargs: Record<string, any>;
  queue?: string;

  // Status
  is_active: boolean;
  is_paused: boolean;
  total_run_count: number;
  last_run_at?: string;
  last_run_success?: boolean;
  last_run_error?: string;

  // Metadata
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface ScheduledTaskCreate {
  name: string;
  task_name: string;
  description?: string;
  schedule_type: 'cron' | 'interval';

  // Cron fields
  cron_minute?: string;
  cron_hour?: string;
  cron_day_of_week?: string;
  cron_day_of_month?: string;
  cron_month_of_year?: string;

  // Interval fields
  interval_value?: number;
  interval_unit?: 'seconds' | 'minutes' | 'hours' | 'days';

  // Task arguments
  args?: any[];
  kwargs?: Record<string, any>;
  queue?: string;
  is_active?: boolean;
}

export interface ScheduledTaskUpdate {
  name?: string;
  task_name?: string;
  description?: string;
  schedule_type?: 'cron' | 'interval';

  // Cron fields
  cron_minute?: string;
  cron_hour?: string;
  cron_day_of_week?: string;
  cron_day_of_month?: string;
  cron_month_of_year?: string;

  // Interval fields
  interval_value?: number;
  interval_unit?: 'seconds' | 'minutes' | 'hours' | 'days';

  // Task arguments
  args?: any[];
  kwargs?: Record<string, any>;
  queue?: string;
  is_active?: boolean;
  is_paused?: boolean;
}

export interface ScheduledTasksResponse {
  count: number;
  data: ScheduledTask[];
}

/**
 * List all scheduled tasks
 */
export async function listScheduledTasks(params?: {
  skip?: number;
  limit?: number;
  include_inactive?: boolean;
}): Promise<ScheduledTasksResponse> {
  const searchParams = new URLSearchParams();
  if (params?.skip !== undefined) searchParams.append('skip', params.skip.toString());
  if (params?.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params?.include_inactive !== undefined) searchParams.append('include_inactive', params.include_inactive.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await apiClient.get(`/scheduled-tasks${query}`);
  return response.data;
}

/**
 * Get a specific scheduled task by ID
 */
export async function getScheduledTask(taskId: string): Promise<ScheduledTask> {
  const response = await apiClient.get(`/scheduled-tasks/${taskId}`);
  return response.data;
}

/**
 * Create a new scheduled task
 */
export async function createScheduledTask(
  data: ScheduledTaskCreate
): Promise<ScheduledTask> {
  const response = await apiClient.post('/scheduled-tasks', data);
  return response.data;
}

/**
 * Update an existing scheduled task
 */
export async function updateScheduledTask(
  taskId: string,
  data: ScheduledTaskUpdate
): Promise<ScheduledTask> {
  const response = await apiClient.patch(`/scheduled-tasks/${taskId}`, data);
  return response.data;
}

/**
 * Delete a scheduled task (soft delete)
 */
export async function deleteScheduledTask(taskId: string): Promise<void> {
  await apiClient.delete(`/scheduled-tasks/${taskId}`);
}

/**
 * Pause a scheduled task
 */
export async function pauseScheduledTask(taskId: string): Promise<ScheduledTask> {
  const response = await apiClient.post(`/scheduled-tasks/${taskId}/pause`);
  return response.data;
}

/**
 * Resume a paused scheduled task
 */
export async function resumeScheduledTask(taskId: string): Promise<ScheduledTask> {
  const response = await apiClient.post(`/scheduled-tasks/${taskId}/resume`);
  return response.data;
}

/**
 * Execute a scheduled task immediately (without waiting for schedule)
 */
export async function runTaskNow(taskId: string): Promise<{
  success: boolean;
  message: string;
  task_id: string;
}> {
  const response = await apiClient.post(`/scheduled-tasks/${taskId}/run-now`);
  return response.data;
}

/**
 * Get list of available Celery tasks (registered in the system + modules)
 */
export async function getAvailableCeleryTasks(): Promise<string[]> {
  try {
    const response = await apiClient.get('/scheduled-tasks/available-tasks');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch available tasks:', error);
    // Fallback to core tasks if API call fails
    return [
      'app.tasks.send_email',
      'app.tasks.cleanup_old_files',
      'app.tasks.collect_stats',
      'app.tasks.execute_scheduled_backups',
      'app.tasks.generate_report',
      'app.tasks.sync_external_data',
      'app.tasks.process_queue_items',
      'app.tasks.update_cache',
    ];
  }
}

/**
 * Helper: Parse cron expression to human-readable format
 */
export function cronToHumanReadable(task: ScheduledTask): string {
  if (task.schedule_type === 'interval') {
    const value = task.interval_value || 1;
    const unit = task.interval_unit || 'minutes';
    return `Every ${value} ${unit}`;
  }

  const minute = task.cron_minute || '*';
  const hour = task.cron_hour || '*';
  const dayOfWeek = task.cron_day_of_week || '*';
  const dayOfMonth = task.cron_day_of_month || '*';
  const month = task.cron_month_of_year || '*';

  // Simple patterns
  if (minute === '*' && hour === '*' && dayOfWeek === '*' && dayOfMonth === '*' && month === '*') {
    return 'Every minute';
  }
  if (minute !== '*' && hour === '*' && dayOfWeek === '*' && dayOfMonth === '*' && month === '*') {
    return `Every hour at minute ${minute}`;
  }
  if (minute !== '*' && hour !== '*' && dayOfWeek === '*' && dayOfMonth === '*' && month === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`;
  }
  if (minute !== '*' && hour !== '*' && dayOfWeek !== '*' && dayOfMonth === '*' && month === '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[parseInt(dayOfWeek)] || `day ${dayOfWeek}`;
    return `Weekly on ${dayName} at ${hour}:${minute.padStart(2, '0')}`;
  }

  // Full cron expression
  return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
}

/**
 * Helper: Validate cron expression component
 */
export function validateCronField(value: string, min: number, max: number): boolean {
  if (value === '*') return true;

  // Handle ranges (e.g., "1-5")
  if (value.includes('-')) {
    const [start, end] = value.split('-').map(Number);
    return start >= min && end <= max && start <= end;
  }

  // Handle lists (e.g., "1,3,5")
  if (value.includes(',')) {
    const values = value.split(',').map(Number);
    return values.every(v => v >= min && v <= max);
  }

  // Handle steps (e.g., "*/5")
  if (value.includes('/')) {
    const [range, step] = value.split('/');
    const stepNum = Number(step);
    if (range === '*') {
      return stepNum > 0 && stepNum <= max;
    }
  }

  // Simple number
  const num = Number(value);
  return num >= min && num <= max;
}
