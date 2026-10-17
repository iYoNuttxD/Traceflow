const ROWS = 12000;
const slowCount = `WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < ${ROWS}) SELECT COUNT(*) AS c FROM s a JOIN s b ON a.n < b.n AND (a.n * 31 + b.n) % 97 = 3`;

async function allowDeepRecursion(tx) {
  await tx.$executeRawUnsafe('SET SESSION cte_max_recursion_depth = 100000');
}

export async function slowQuery(tx) {
  await allowDeepRecursion(tx);
  return tx.$queryRawUnsafe(slowCount);
}

export async function slowUpdate(tx, userId) {
  await allowDeepRecursion(tx);
  return tx.$executeRawUnsafe(
    `UPDATE User SET name = (SELECT CONCAT('pesado ', c) FROM (${slowCount}) t) WHERE id = ${Number(userId)}`
  );
}
