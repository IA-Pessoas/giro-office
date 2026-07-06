# Admin Users Tab Manual Verification

## Scope
Manual verification checklist for the `/administracao` users tab flow after the frontend-only delivery.

## Checklist
- Open `/administracao` and switch to the `Usuarios` tab.
- Confirm the users list loads and the first user becomes selected automatically.
- Type into the search field and confirm the visible list changes without a new page navigation.
- Change the status filter and confirm the rendered list updates while preserving the selected user when possible.
- Select a user and confirm the detail panel loads data from the current backend response.
- Edit `name`, `department_id`, `permission`, and `status`, save, and confirm the list stays in sync.
- Leave `password` empty while saving and confirm the update still succeeds.
- Open `Novo Usuario`, create a user using departments returned by the backend, and confirm the list refreshes with the current filter preserved.
- Simulate department failure or empty departments and confirm create/edit actions become visibly blocked.
- Confirm no mocked department data appears anywhere in the flow.
- Open `/users` and confirm the legacy page still works without regression.
