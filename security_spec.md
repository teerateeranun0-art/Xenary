# XENARY Store Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All unspecified paths under `/databases/{database}/documents` MUST be denied (`allow read, write: if false`).
2. **Identity Integrity**: Every user-owned document (`users/{userId}`, `users/{userId}/private/{docId}`, `orders/{orderId}`, `topups/{topupId}`) MUST match `request.auth.uid` on creation and maintain immutable ownership (`uid` / `userId`) across updates.
3. **Zero Privilege Escalation**: Regular users MUST ONLY create `/users/{userId}` with `role == 'user'`, `balanceSatangs == 0`, and `banned == false`. Users cannot modify `role`, `balanceSatangs`, or `banned`. Only verified admins (`isAdmin()`) may write to `/admins/{userId}`, adjust balances, or assign roles.
4. **PII Isolation**: User email addresses reside exclusively under `/users/{userId}/private/{docId}`, accessible strictly to the owner (`request.auth.uid == userId`) or verified admin (`isAdmin()`).
5. **Financial & Terminal State Locking**:
   - Orders (`/orders/{orderId}`) created by a user must start with `status == 'pending'`, `quantity >= 1 && quantity <= 10`, and `totalSatangs >= 0 && totalSatangs <= 1000000000000`. Once an order reaches `delivered` or `cancelled`, non-admins CANNOT update it.
   - Topups (`/topups/{topupId}`) created by a user must start with `status == 'pending'` and positive `amountSatangs`. Users CANNOT self-approve (`approved`/`completed`) topups.
6. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update. `updatedAt` must equal `request.time` on create and update.
7. **Verified Email Mandate**: Standard write operations require `request.auth != null && request.auth.token.email_verified == true`.
8. **Path ID & Size Bounds**: Every document ID (`userId`, `orderId`, `topupId`, `productId`, etc.) must satisfy `^[a-zA-Z0-9_\-]+$` and `.size() <= 128`. Every string field has explicit `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Role Injection (Create `/users/{uid}`)**: `{ uid, username: "hacker", role: "admin", balanceSatangs: 0, banned: false, createdAt: request.time, updatedAt: request.time }` -> **PERMISSION_DENIED**
2. **Initial Balance Spoofing (Create `/users/{uid}`)**: `{ uid, username: "hacker", role: "user", balanceSatangs: 99999900, banned: false, createdAt: request.time, updatedAt: request.time }` -> **PERMISSION_DENIED**
3. **Shadow Field Injection (Create `/users/{uid}`)**: `{ uid, username: "valid", role: "user", balanceSatangs: 0, banned: false, isAdmin: true, createdAt: request.time, updatedAt: request.time }` -> **PERMISSION_DENIED**
4. **Cross-User Balance Modification (Update `/users/{uid}`)**: Authenticated user attempts `{ balanceSatangs: 100000, updatedAt: request.time }` -> **PERMISSION_DENIED**
5. **Unverified Email Spoofing**: Token with `email: "teerateeranun0@gmail.com"` and `email_verified: false` attempts admin write -> **PERMISSION_DENIED**
6. **PII Cross-Read Attack (Get `/users/{otherUid}/private/info`)**: Authenticated user reads another user's private email document -> **PERMISSION_DENIED**
7. **Unauthorized Order Status Shortcutting (Create `/orders/{id}`)**: User creates order with `status: "delivered"` directly -> **PERMISSION_DENIED**
8. **Terminal Order Mutation (Update `/orders/{id}`)**: User updates an order already in `status: "delivered"` -> **PERMISSION_DENIED**
9. **Self-Approval Topup Exploit (Update `/topups/{id}`)**: User updates their pending topup to `status: "approved"` -> **PERMISSION_DENIED**
10. **Blanket List Query Scraping (List `/orders`)**: User executes `collection(db, 'orders')` without filtering by `userId == request.auth.uid` -> **PERMISSION_DENIED**
11. **ID Poisoning / Resource Exhaustion (Create `/orders/{1500_char_id}`)**: Oversized or regex-invalid document ID -> **PERMISSION_DENIED**
12. **Client Timestamp Forgery (Create `/orders/{id}`)**: `createdAt` set to backdated timestamp instead of `request.time` -> **PERMISSION_DENIED**
