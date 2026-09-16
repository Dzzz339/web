import sys
import json
from ortools.sat.python import cp_model

# Настройка кодировки UTF-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def optimize_supply_distribution(data):
    """
    CP-SAT оптимизатор снабжения:
    Распределяет ТМЦ со складов компании подрядчикам под их потребности (заявки)
    с учетом целочисленной кратности упаковки (бухты по 305м, хлысты по 2м)
    и минимизацией логистических затрат.
    """
    warehouses = data.get('warehouses', [])
    contractors = data.get('contractors', [])
    materials = data.get('materials', [])
    stock_balances = data.get('stock_balances', []) # [{warehouse_id, material_id, quantity}]
    demands = data.get('demands', []) # [{contractor_id, contractor_warehouse_id, material_id, needed_qty}]

    if not warehouses or not demands:
        return {"success": True, "transfers": [], "unmet_demands": [], "message": "Нет данных для оптимизации"}

    # Индексация остатков: (wh_id, mat_id) -> int
    stock_map = {}
    for b in stock_balances:
        stock_map[(b['warehouse_id'], b['material_id'])] = int(float(b.get('quantity', 0)))

    # Индексация материалов: mat_id -> mat dict
    mat_map = {m['id']: m for m in materials}

    # Инициализация модели CP-SAT
    model = cp_model.CpModel()

    # Переменные:
    # packages[w_id, c_id, m_id] -> целое число упаковок
    # shipped[w_id, c_id, m_id] -> фактическое количество (packages * package_qty)
    # ship_trip[w_id, c_id] -> bool (был ли рейс со склада w подрядчику c)
    packages_vars = {}
    shipped_vars = {}
    trip_vars = {}
    unmet_vars = {}

    wh_ids = [w['id'] for w in warehouses]
    c_ids = [c['id'] for c in contractors]

    # Создаем булевы переменные рейсов
    for w in warehouses:
        for c in contractors:
            trip_vars[(w['id'], c['id'])] = model.NewBoolVar(f"trip_{w['id']}_{c['id']}")

    # Создаем переменные поставок для каждой потребности
    demand_lookup = {}
    for d in demands:
        c_id = d['contractor_id']
        m_id = d['material_id']
        needed = int(float(d['needed_qty']))
        if needed <= 0:
            continue
        demand_lookup[(c_id, m_id)] = needed

        # Непокрытый дефицит (если на всех складах не хватает)
        unmet_vars[(c_id, m_id)] = model.NewIntVar(0, needed, f"unmet_{c_id}_{m_id}")

        mat = mat_map.get(m_id, {'package_qty': 1})
        pkg_qty = max(1, int(float(mat.get('package_qty') or 1)))

        # Макс. возможное число упаковок
        max_pkgs = max(1, (needed // pkg_qty) + 2)

        for w_id in wh_ids:
            avail = stock_map.get((w_id, m_id), 0)
            max_w_pkgs = max(0, avail // pkg_qty) if avail > 0 else 0
            ub = min(max_pkgs, max_w_pkgs) if max_w_pkgs > 0 else 0

            p_var = model.NewIntVar(0, ub, f"pkg_{w_id}_{c_id}_{m_id}")
            packages_vars[(w_id, c_id, m_id)] = p_var

            s_var = model.NewIntVar(0, ub * pkg_qty, f"ship_{w_id}_{c_id}_{m_id}")
            shipped_vars[(w_id, c_id, m_id)] = s_var

            # Связь: shipped = packages * package_qty
            model.Add(s_var == p_var * pkg_qty)

            # Связь с рейсом: если shipped > 0, то trip = 1
            model.Add(s_var <= 1000000 * trip_vars[(w_id, c_id)])

    # 1. Ограничение: Суммарная отгрузка со склада не должна превышать его остаток
    for w_id in wh_ids:
        for m_id in mat_map.keys():
            avail = stock_map.get((w_id, m_id), 0)
            matching_shipped = [shipped_vars[(w_id, c_id, m_id)] for c_id in c_ids if (w_id, c_id, m_id) in shipped_vars]
            if matching_shipped:
                model.Add(sum(matching_shipped) <= avail)

    # 2. Ограничение: Покрытие потребностей подрядчика (с учетом дефицита unmet)
    for (c_id, m_id), needed in demand_lookup.items():
        shipped_to_c = [shipped_vars[(w_id, c_id, m_id)] for w_id in wh_ids if (w_id, c_id, m_id) in shipped_vars]
        if shipped_to_c:
            model.Add(sum(shipped_to_c) + unmet_vars[(c_id, m_id)] >= needed)
        else:
            model.Add(unmet_vars[(c_id, m_id)] == needed)

    # 3. Целевая функция:
    # Минимизировать:
    # (Стоимость рейсов * 1000) + (Мелкие перемещения) + (Штраф за непокрытый дефицит * 50000)
    objective_terms = []

    # Стоимость рейсов
    for (w_id, c_id), trip_var in trip_vars.items():
        w_obj = next((x for x in warehouses if x['id'] == w_id), None)
        c_obj = next((x for x in contractors if x['id'] == c_id), None)
        # Если в одном регионе — рейс дешевле
        same_region = (w_obj and c_obj and w_obj.get('region') and w_obj.get('region') == c_obj.get('region'))
        trip_cost = 500 if same_region else 1500
        objective_terms.append(trip_var * trip_cost)

    # Штраф за непокрытый дефицит (очень высокий, чтобы решатель стремился закрыть максимум)
    for unmet_var in unmet_vars.values():
        objective_terms.append(unmet_var * 10000)

    model.Minimize(sum(objective_terms))

    # Запуск решателя CP-SAT
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    solver.parameters.num_workers = 4
    status = solver.Solve(model)

    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        return {"success": False, "error": f"Не удалось найти решение (статус: {solver.StatusName(status)})"}

    # Сборка результатов
    transfers = []
    for (w_id, c_id, m_id), s_var in shipped_vars.items():
        qty = solver.Value(s_var)
        pkgs = solver.Value(packages_vars[(w_id, c_id, m_id)])
        if qty > 0:
            w_obj = next(x for x in warehouses if x['id'] == w_id)
            c_obj = next(x for x in contractors if x['id'] == c_id)
            mat = mat_map[m_id]
            transfers.append({
                "source_warehouse_id": w_id,
                "source_warehouse_name": w_obj.get('name'),
                "contractor_id": c_id,
                "contractor_name": c_obj.get('name_short') or c_obj.get('name'),
                "target_warehouse_id": c_obj.get('warehouse_id'),
                "material_id": m_id,
                "material_code": mat.get('code'),
                "material_name": mat.get('name'),
                "quantity": qty,
                "packages": pkgs,
                "package_unit": mat.get('package_unit'),
                "unit": mat.get('unit')
            })

    unmet_list = []
    for (c_id, m_id), u_var in unmet_vars.items():
        unmet_qty = solver.Value(u_var)
        if unmet_qty > 0:
            c_obj = next(x for x in contractors if x['id'] == c_id)
            mat = mat_map[m_id]
            unmet_list.append({
                "contractor_id": c_id,
                "contractor_name": c_obj.get('name_short') or c_obj.get('name'),
                "material_id": m_id,
                "material_code": mat.get('code'),
                "material_name": mat.get('name'),
                "deficit_qty": unmet_qty,
                "unit": mat.get('unit'),
                "recommendation": "Сформировать заказ поставщику (Purchase Order)"
            })

    return {
        "success": True,
        "solver_status": solver.StatusName(status),
        "total_cost": solver.ObjectiveValue(),
        "transfers": transfers,
        "unmet_demands": unmet_list
    }

if __name__ == '__main__':
    try:
        input_raw = sys.stdin.read()
        if not input_raw:
            print(json.dumps({"error": "Пустые входные данные"}))
            sys.exit(1)
        payload = json.loads(input_raw)
        res = optimize_supply_distribution(payload)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
