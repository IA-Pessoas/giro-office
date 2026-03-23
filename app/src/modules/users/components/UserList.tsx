import React from 'react';
import type { UserItem } from '../types';

interface UserListProps {
  users: UserItem[];
  onUserSelect: (userId: string) => void;
}

export function UserList({ users, onUserSelect }: UserListProps) {
  return (
    <div className="h-[170px] w-full overflow-x-auto overflow-y-hidden bg-[var(--colors-white)] p-2 md:h-full md:overflow-x-hidden md:overflow-y-auto">
      <div className="flex w-full flex-row pb-2 md:flex-col">
        {users.length > 0 ? (
          users.map((user) => (
            <article
              key={user.id}
              className="mr-3 mb-0 w-[200px] min-w-[200px] cursor-pointer rounded-md bg-white shadow-sm transition-transform hover:scale-[1.01] md:mr-0 md:mb-2 md:w-full md:min-w-0"
              style={{ borderLeft: `5px solid ${user.department?.color || '#ccc'}` }}
              onClick={() => onUserSelect(user.id)}
            >
              <div className="p-4">
                <p className="text-md truncate font-bold">{user.name}</p>
                <p className="text-sm text-slate-500">{user.department?.name}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="mt-4 w-full text-center text-slate-500">
            Nenhum usuário encontrado.
          </p>
        )}
      </div>
    </div>
  );
}