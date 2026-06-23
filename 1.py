import math

def vec_norm(v):
    return math.sqrt(sum(vi**2 for vi in v))

def make_matrix(N, a, b):
    A = []
    for i in range(1, N + 1):
        row = [1.0 / (1 + a * i + b * j) for j in range(1, N + 1)]
        A.append(row)
    return A

def mat_vec(A, x):
    N = len(x)
    res = [0.0] * N
    for i in range(N):
        for j in range(N):
            res[i] += A[i][j] * x[j]
    return res

def mat_mul(A, B):
    n = len(A); m = len(B[0]); k = len(B)
    C = [[0.0] * m for _ in range(n)]
    for i in range(n):
        for j in range(m):
            for l in range(k):
                C[i][j] += A[i][l] * B[l][j]
    return C

def mat_T(A):
    n = len(A); m = len(A[0])
    return [[A[i][j] for i in range(n)] for j in range(m)]

def relative_error(x_num, x_exact):
    diff = [x_num[i] - x_exact[i] for i in range(len(x_num))]
    return vec_norm(diff) / vec_norm(x_exact)

def jacobi_eig(S):
    n = len(S)
    A = [row[:] for row in S]
    V = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(2000 * n * n):
        max_val = 0.0
        p, q = 0, 1
        for i in range(n):
            for j in range(i + 1, n):
                if abs(A[i][j]) > max_val:
                    max_val = abs(A[i][j])
                    p, q = i, j
        if max_val < 1e-14:
            break
        if abs(A[p][p] - A[q][q]) < 1e-15:
            theta = math.pi / 4
        else:
            theta = 0.5 * math.atan2(2 * A[p][q], A[p][p] - A[q][q])
        c = math.cos(theta)
        s = math.sin(theta)
        Anew = [row[:] for row in A]
        for i in range(n):
            Anew[i][p] = c * A[i][p] + s * A[i][q]
            Anew[i][q] = -s * A[i][p] + c * A[i][q]
        for i in range(n):
            Anew[p][i] = c * A[p][i] + s * A[q][i]
            Anew[q][i] = -s * A[p][i] + c * A[q][i]
        Anew[p][p] = c**2 * A[p][p] + 2*s*c * A[p][q] + s**2 * A[q][q]
        Anew[q][q] = s**2 * A[p][p] - 2*s*c * A[p][q] + c**2 * A[q][q]
        Anew[p][q] = 0.0
        Anew[q][p] = 0.0
        A = Anew
        Vnew = [row[:] for row in V]
        for i in range(n):
            Vnew[i][p] = c * V[i][p] + s * V[i][q]
            Vnew[i][q] = -s * V[i][p] + c * V[i][q]
        V = Vnew
    evals = [A[i][i] for i in range(n)]
    return evals, V

SVD_THRESHOLD = 1e-10

def compute_svd(A):
    n = len(A)
    AT = mat_T(A)
    ATA = mat_mul(AT, A)
    evals, V = jacobi_eig(ATA)
    sigmas = [math.sqrt(max(0.0, e)) for e in evals]
    # Сортируем сингулярные числа по убыванию
    order = sorted(range(n), key=lambda i: -sigmas[i])
    sigmas = [sigmas[i] for i in order]
    V_sorted = [[V[i][order[j]] for j in range(n)] for i in range(n)]
    U_cols = []
    for j in range(n):
        if sigmas[j] > SVD_THRESHOLD:
            Avj = [sum(A[i][k] * V_sorted[k][j] for k in range(n)) for i in range(n)]
            U_cols.append([x / sigmas[j] for x in Avj])
        else:
            u = [0.0] * n
            u[j] = 1.0
            U_cols.append(u)
    U = [[U_cols[j][i] for j in range(n)] for i in range(n)]
    return U, sigmas, V_sorted

def solve_svd(A, f):
    n = len(f)
    U, sigmas, V = compute_svd(A)
    UT = mat_T(U)
    z = [sum(UT[i][k] * f[k] for k in range(n)) for i in range(n)]
    # Отсекаем сингулярные числа меньше SVD_THRESHOLD = 1e-10
    y = [z[i] / sigmas[i] if sigmas[i] > SVD_THRESHOLD else 0.0
         for i in range(n)]
    x = [sum(V[i][j] * y[j] for j in range(n)) for i in range(n)]
    return x, sigmas

def cond_number(sigmas):
    s_nz = [s for s in sigmas if s > SVD_THRESHOLD]
    if not s_nz:
        return float('inf')
    return max(s_nz) / min(s_nz)

if __name__ == "__main__":
    a, b = 4.543, 4.721
    print("SVD (метод Якоби для A^T A, порог = 1e-10)")
    print(f"a = {a}, b = {b}")
    print("-" * 60)
    for N in [5, 10, 20]:
        A = make_matrix(N, a, b)
        x_exact = [1.0] * N
        f = mat_vec(A, x_exact)
        try:
            x, sigmas = solve_svd(A, f)
            delta = relative_error(x, x_exact)
            cond = cond_number(sigmas)
            print(f"N = {N:2d}: delta = {delta:.4e} | Cond = {cond:.2e}")
        except Exception as e:
            print(f"N = {N:2d}: FAIL — {e}")