export const SLOW_STATEMENT_SECONDS = 15;

export function slowQuery(tx, seconds = SLOW_STATEMENT_SECONDS) {
  return tx.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM (SELECT SLEEP(${Number(seconds)}) AS pause) AS slow`
  );
}

export function slowUpdate(tx, userId, seconds = SLOW_STATEMENT_SECONDS) {
  return tx.$executeRawUnsafe(
    `UPDATE User SET name = CONCAT('pesado ', SLEEP(${Number(seconds)})) WHERE id = ${Number(userId)}`
  );
}
