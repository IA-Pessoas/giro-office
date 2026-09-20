import { setupAPIClient } from "@shared/services/api";

type TaskOperationalNotification = {
  id: string;
  task_id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type TaskOperationalNotificationInbox = {
  items: TaskOperationalNotification[];
  unread_count: number;
};

function unwrap<T>(body: unknown): T {
  return (body as { data: T }).data;
}

export const taskOperationalNotificationService = {
  async list(): Promise<TaskOperationalNotificationInbox> {
    return unwrap((await setupAPIClient().get("/task/notifications")).data);
  },
  async markRead(notificationId: string): Promise<void> {
    await setupAPIClient().put("/task/notifications/read", { notification_id: notificationId });
  },
};

export type { TaskOperationalNotification };
