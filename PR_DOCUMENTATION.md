# PR: PermissionService Integration + User Photo Upload (Supabase Storage)

## Summary

This PR extends the user-service with:
1. **PermissionService integration** for organization and module-based permissions
2. **User photo upload and deletion** via Supabase Storage

---

## 1. PermissionService Integration

### Schema Changes (Prisma)
- New fields on `User`: `organization_id`, `type`, `first_owner_flag`, `permission_id`
- Relations with `Organization` and `Permission`
- Migration: `20260313163600_add_user_org_type_permission`

### UserService
- **create**: Calls `PermissionService.create` and `PermissionService.update` when `organization_id` is provided
  - `type: "owner"` → grants all modules (MAX_MODULES)
  - `type: "admin"` or `"user"` → uses `modules` object for granular permissions
- **update**: Handles `modules` and `type` updates; owner type triggers MAX_MODULES
- **USER_PUBLIC_SELECT** extended with `organization_id`, `type`, `first_owner_flag`, `permission_id`

### User Routes (POST, PATCH)
- New body fields: `organization_id`, `type`, `first_owner_flag`, `modules`
- Validation: `organization_id` required when `type` or `modules` are sent
- Validation: `type` must be `admin`, `owner`, or `user`
- Validation: `first_owner_flag` can only be `true` when `type` is `owner`

### Permission Routes (new)
- `GET /permission/:userId` – fetch user permissions (optional `?modulo` filter)
- `PUT /permission/:userId` – update user permissions (body: `{ moduleName: level }`)

---

## 2. User Photo Upload (Supabase Storage)

### New Files
- `src/integrations/supabase.ts` – Supabase client
- `src/middlewares/upload.ts` – Multer middleware (5MB limit, JPEG/PNG/WebP)
- `src/services/StorageService.ts` – `uploadUserPhoto`, `deleteUserPhoto`

### New Routes
- `POST /users/:id/photo` – upload photo (form-data, field: `file`)
- `DELETE /users/:id/photo` – delete photo from storage and clear `photo_url` in DB

### Environment Variables
- `SUPABASE_URL` – Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key

### Dependencies
- `@supabase/supabase-js`
- `multer`
- `@types/multer` (dev)

---

## Known Limitations

- **Gateway proxy**: Multipart/form-data (file upload) is not forwarded correctly by the gateway. Use direct calls to the user-service (e.g. port 3335) for `POST /users/:id/photo`. `DELETE /users/:id/photo` works through the gateway.

---

## Testing

### Permission
```json
POST /users
{
  "name": "...",
  "login": "...",
  "password": "...",
  "department_id": "...",
  "permission": 2,
  "organization_id": "...",
  "type": "user",
  "modules": { "atendimento": 2, "fiscal": 1 }
}
```

### Photo Upload
- `POST /users/:id/photo` – form-data, key: `file`, value: image file
- `DELETE /users/:id/photo` – no body

---

## Checklist

- [ ] Bucket `Fotos` exists in Supabase Storage
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in `.env`
- [ ] Migration applied (`pnpm prisma migrate dev`)
