# Security Specification: Dispatch Board

## 1. Data Invariants
- `dispatch_boards/{boardId}` must contain `title` (string <= 100 chars), `columns` (list <= 100), `rows` (list <= 500).
- Public read access is allowed so that the schedule can be viewed by all staff on the website.
- Write access requires authenticated users (Google Login).
- Board ID must be a valid alphanumeric string.

## 2. Payloads & Vulnerability Tests
1. Unauthenticated write payload -> REJECTED.
2. Huge boardId (>128 chars) -> REJECTED.
3. Title exceeding 100 characters -> REJECTED.
4. Non-list columns property -> REJECTED.
5. Non-list rows property -> REJECTED.
6. Columns array > 100 elements -> REJECTED.
7. Rows array > 500 elements -> REJECTED.
8. Unknown additional top-level keys injection -> REJECTED.
9. Malicious code injection in boardId -> REJECTED.
10. Anonymous spoofed write without valid auth -> REJECTED.
11. Write without required properties -> REJECTED.
12. Random unmatched collection write -> REJECTED by global safety net.
