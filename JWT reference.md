# JWT Auth Reference — iMocha Candidate Platform (Migration1)

## Architecture at a Glance

```
Browser (Angular 18)
  └── login.component  →  POST /api/auth/login  →  AuthController
                                                        └── AuthRepository (Dapper → UserMaster)
                                                        └── BCrypt.Verify(password, hash)
                                                        └── JwtSecurityTokenHandler.WriteToken()
                          ← { token, userId, userName, ... }
  └── localStorage["jwt_token"]         ← raw JWT string
  └── localStorage["user_info"]         ← full LoginResponse JSON
  └── jwtInterceptor adds Bearer header on every HttpClient request
  └── authGuard blocks all /candidates/* routes unless token present
  └── 401 response → authService.logout() → /login
```

---

## Shared Constants

> Any new project that uses the same key, issuer, audience, and localStorage keys gets **SSO for free** — no re-login required.

| Constant | Value |
|---|---|
| JWT Signing Key | `k8Tz4mN9vQwXjL2pR6sY0bFgHcEdAuIo` |
| Issuer | `CandidatePlatformAPI` |
| Audience | `CandidatePlatformClient` |
| Token TTL | `120` minutes |
| localStorage token key | `jwt_token` |
| localStorage user key | `user_info` |

---

## Backend (.NET 8 Web API)

### 1. `appsettings.json` — JWT Configuration

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost,1433;Database=CandidatePlatformDB;User ID=sa;Password=Migration#Pass123;TrustServerCertificate=true;"
  },
  "Jwt": {
    "Key": "k8Tz4mN9vQwXjL2pR6sY0bFgHcEdAuIo",
    "Issuer": "CandidatePlatformAPI",
    "Audience": "CandidatePlatformClient",
    "ExpiryMinutes": 120
  }
}
```

---

### 2. `Program.cs` — Wire Up JWT Middleware

```csharp
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var jwtKey = builder.Configuration["Jwt:Key"]!;

// ── JWT Authentication ────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

// ── CORS — allow Angular dev server ──────────────────────────────────────────
builder.Services.AddCors(options =>
    options.AddPolicy("Angular", p =>
        p.WithOrigins("http://localhost:4200")   // change port per project
         .AllowAnyMethod()
         .AllowAnyHeader()));

builder.Services.AddControllers();

// ── Register repositories ─────────────────────────────────────────────────────
var cs = builder.Configuration.GetConnectionString("DefaultConnection")!;
builder.Services.AddSingleton<IAuthRepository>(new AuthRepository(cs));
// add other repositories here...

var app = builder.Build();

app.UseCors("Angular");
app.UseAuthentication();   // ORDER MATTERS: Authentication before Authorization
app.UseAuthorization();
app.MapControllers();
app.Run();
```

---

### 3. Core DTOs — `CandidatePlatform.Core/DTOs/AuthDtos.cs`

```csharp
namespace CandidatePlatform.Core.DTOs;

// What the frontend sends
public class LoginRequestDto
{
    public string Email    { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

// What the frontend receives (stored as user_info in localStorage)
public class LoginResponseDto
{
    public string   Token                       { get; set; } = string.Empty;
    public long     UserId                      { get; set; }
    public string   UserName                    { get; set; } = string.Empty;
    public string   Email                       { get; set; } = string.Empty;
    public long     CustomerId                  { get; set; }
    public long     AccountType                 { get; set; }
    public int      IsCompletionTimeFlagEnabled  { get; set; }
    public int      IsWindowsViolationEnabled    { get; set; }
    public DateTime ExpiresAt                   { get; set; }
}
```

---

### 4. Domain Model — `CandidatePlatform.Core/Interfaces/IAuthRepository.cs`

```csharp
namespace CandidatePlatform.Core.Interfaces;

// The database row mapped by Dapper
public class UserRecord
{
    public long   UserId                      { get; set; }
    public long   CustomerId                  { get; set; }
    public string UserName                    { get; set; } = string.Empty;
    public string Email                       { get; set; } = string.Empty;
    public string PasswordHash                { get; set; } = string.Empty;  // BCrypt hash
    public short  RoleId                      { get; set; }
    public long   AccountType                 { get; set; }
    public int    Status                      { get; set; }
    public int    IsCompletionTimeFlagEnabled  { get; set; }
    public int    IsWindowsViolationEnabled    { get; set; }
}

public interface IAuthRepository
{
    Task<UserRecord?> GetUserByEmailAsync(string email);
}
```

---

### 5. Repository — `CandidatePlatform.Infrastructure/Repositories/AuthRepository.cs`

```csharp
using Dapper;
using Microsoft.Data.SqlClient;

public class AuthRepository : IAuthRepository
{
    private readonly string _connectionString;
    public AuthRepository(string connectionString) => _connectionString = connectionString;

    public async Task<UserRecord?> GetUserByEmailAsync(string email)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        // Fetch the user row — password is verified in the controller via BCrypt
        // The hash is NEVER returned over the wire
        var sql = @"
            SELECT
                u.UserId,
                u.CustomerId,
                u.FirstName        AS UserName,
                u.Email,
                u.PasswordHash,
                u.RoleId,
                ISNULL(u.AccountType, 1) AS AccountType,
                u.Status,
                1 AS IsCompletionTimeFlagEnabled,
                1 AS IsWindowsViolationEnabled
            FROM UserMaster u
            WHERE u.Email = @Email AND u.Status = 1";

        return await connection.QueryFirstOrDefaultAsync<UserRecord>(sql, new { Email = email });
    }
}
```

> **Key rule:** The repository only fetches the row. BCrypt verification happens in the controller — the password hash is never returned over the wire.

---

### 6. Controller — `CandidatePlatform.API/Controllers/AuthController.cs`

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthRepository _authRepository;
    private readonly IConfiguration  _configuration;

    public AuthController(IAuthRepository authRepository, IConfiguration configuration)
    {
        _authRepository = authRepository;
        _configuration  = configuration;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        // 1. Look up user by email
        var user = await _authRepository.GetUserByEmailAsync(request.Email);
        if (user == null)
            return Unauthorized(new { message = "Invalid email or password." });

        // 2. BCrypt verification (same as legacy PasswordService.VerifyPassword)
        bool valid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
        if (!valid)
            return Unauthorized(new { message = "Invalid email or password." });

        // 3. Generate JWT token
        var expiresAt = DateTime.UtcNow.AddMinutes(
            _configuration.GetValue<int>("Jwt:ExpiryMinutes", 120));
        var token = GenerateJwtToken(user, expiresAt);

        return Ok(new LoginResponseDto
        {
            Token                       = token,
            UserId                      = user.UserId,
            UserName                    = user.UserName,
            Email                       = user.Email,
            CustomerId                  = user.CustomerId,
            AccountType                 = user.AccountType,
            IsCompletionTimeFlagEnabled = user.IsCompletionTimeFlagEnabled,
            IsWindowsViolationEnabled   = user.IsWindowsViolationEnabled,
            ExpiresAt                   = expiresAt
        });
    }

    private string GenerateJwtToken(UserRecord user, DateTime expiresAt)
    {
        var key         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Claims embedded in the token — readable server-side via User.FindFirst()
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),     // standard "sub"
            new Claim("CustomerId",              user.CustomerId.ToString()),
            new Claim("AccountType",             user.AccountType.ToString()),
            new Claim(ClaimTypes.Role,           user.RoleId.ToString()),
            new Claim(ClaimTypes.Name,           user.UserName),
            new Claim(ClaimTypes.Email,          user.Email),
            new Claim("IsCompletionTimeFlagEnabled", user.IsCompletionTimeFlagEnabled.ToString()),
            new Claim("IsWindowsViolationEnabled",   user.IsWindowsViolationEnabled.ToString())
        };

        var token = new JwtSecurityToken(
            issuer:             _configuration["Jwt:Issuer"],
            audience:           _configuration["Jwt:Audience"],
            claims:             claims,
            expires:            expiresAt,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

**How any protected controller reads claims from the token:**

```csharp
[Authorize]
public class SomeController : ControllerBase
{
    private long GetUserId()      => long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
    private long GetCustomerId()  => long.Parse(User.FindFirst("CustomerId")?.Value ?? "0");
    private long GetAccountType() => long.Parse(User.FindFirst("AccountType")?.Value ?? "0");
}
```

---

## Frontend (Angular 18 Standalone)

### 7. Models — `src/app/core/models/candidate.models.ts`

```typescript
export interface LoginRequest {
  email:    string;
  password: string;
}

export interface LoginResponse {
  token:                       string;
  userId:                      number;
  userName:                    string;
  email:                       string;
  customerId:                  number;
  accountType:                 number;
  isCompletionTimeFlagEnabled: number;
  isWindowsViolationEnabled:   number;
  expiresAt:                   string;
}
```

---

### 8. Auth Service — `src/app/core/services/auth.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { LoginRequest, LoginResponse } from '../models/candidate.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // These two keys are shared across ALL projects — never rename them
  private readonly TOKEN_KEY = 'jwt_token';
  private readonly USER_KEY  = 'user_info';

  private loggedIn$ = new BehaviorSubject<boolean>(this.hasToken());

  constructor(private http: HttpClient, private router: Router) {}

  // POST /api/auth/login → stores token + full user object in localStorage
  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', request).pipe(
      tap(response => {
        localStorage.setItem(this.TOKEN_KEY, response.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(response));
        this.loggedIn$.next(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.loggedIn$.next(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null  { return localStorage.getItem(this.TOKEN_KEY); }
  isAuthenticated(): boolean { return this.hasToken(); }

  get isLoggedIn$(): Observable<boolean> { return this.loggedIn$.asObservable(); }

  // Used by components to read userId, customerId, accountType, etc.
  getUserInfo(): LoginResponse | null {
    const info = localStorage.getItem(this.USER_KEY);
    return info ? JSON.parse(info) : null;
  }

  private hasToken(): boolean { return !!localStorage.getItem(this.TOKEN_KEY); }
}
```

---

### 9. JWT Interceptor — `src/app/core/interceptors/jwt.interceptor.ts`

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, throwError } from 'rxjs';

// Automatically attaches "Authorization: Bearer <token>" to every HTTP request
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(error => {
      if (error.status === 401) {
        authService.logout();   // token expired or invalid → redirect to /login
      }
      return throwError(() => error);
    })
  );
};
```

---

### 10. Auth Guard — `src/app/core/guards/auth.guard.ts`

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Applied to any route that requires login
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router      = inject(Router);
  return authService.isAuthenticated() ? true : router.createUrlTree(['/login']);
};
```

---

### 11. App Config — `src/app/app.config.ts`

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor])),  // ← register interceptor here
  ],
};
```

---

### 12. Routes — `src/app/app.routes.ts`

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '',      redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'candidates',
    canActivate: [authGuard],   // guard on parent protects ALL children automatically
    children: [
      {
        path: 'live-data',
        loadComponent: () =>
          import('./candidates/live-data.component').then(m => m.LiveDataComponent),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
    ],
  },
  { path: '**', redirectTo: '/login' },
];
```

---

### 13. Proxy Config — `proxy.conf.json`

```json
{
  "/api": {
    "target": "http://localhost:5000",
    "secure": false,
    "changeOrigin": true
  }
}
```

Start Angular dev server with:

```bash
ng serve --proxy-config proxy.conf.json
```

---

## NuGet Packages Required (Backend)

```xml
<PackageReference Include="BCrypt.Net-Next"                              Version="4.0.3"  />
<PackageReference Include="Dapper"                                       Version="2.1.35" />
<PackageReference Include="Microsoft.Data.SqlClient"                     Version="5.2.0"  />
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.0" />
<PackageReference Include="Microsoft.IdentityModel.Tokens"               Version="8.0.0"  />
```

---

## Adapting for a New Project

| What to change | Where |
|---|---|
| `WithOrigins("http://localhost:4200")` | `Program.cs` — match your Angular port |
| `target` in `proxy.conf.json` | Match your .NET API port |
| Route prefix (`candidates`) in `app.routes.ts` | Change to your route prefix |
| Feature-flag fields in DTOs and interfaces | Add or remove per project needs |
| **Do NOT change** JWT Key / Issuer / Audience | Changing breaks cross-project SSO |
| **Do NOT change** `jwt_token` / `user_info` localStorage keys | Same keys = shared session across projects |

---

## Complete Login Data Flow (Step by Step)

```
1. User fills email + password in LoginComponent
2. login.component calls authService.login({ email, password })
3. AuthService POSTs to /api/auth/login via HttpClient
4. jwtInterceptor sees no token yet — sends request without Authorization header
5. AuthController receives LoginRequestDto
6. AuthRepository queries UserMaster WHERE Email = @Email AND Status = 1
7. Controller calls BCrypt.Net.BCrypt.Verify(plainPassword, storedHash)
8. If valid → GenerateJwtToken() builds a JwtSecurityToken with 8 claims
9. Controller returns 200 OK with LoginResponseDto { token, userId, userName, ... }
10. AuthService.tap() stores token in localStorage["jwt_token"]
11. AuthService.tap() stores full response in localStorage["user_info"]
12. Angular Router navigates to /candidates/live-data (or /candidates/dashboard)
13. authGuard checks isAuthenticated() → true → route loads
14. All subsequent HttpClient requests → jwtInterceptor clones request + adds Bearer header
15. Protected controllers extract claims: User.FindFirst(ClaimTypes.NameIdentifier) etc.
16. On 401 → jwtInterceptor calls authService.logout() → clears localStorage → /login
```
