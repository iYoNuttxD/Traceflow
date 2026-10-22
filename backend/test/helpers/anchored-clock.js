// Dia-âncora para testes que misturam datas fixas de eventos do GitHub com linhas criadas
// pelo relógio real (cobertura de eventos, vínculos de Task). Com um dia fixo, o evento
// vira passado depois dessa data e a janela de cobertura passa a descartá-lo. O dia é
// sempre o seguinte ao da execução (UTC), com os mesmos horários de antes.
const DAY_MS = 86_400_000;
const ANCHOR_DAY_MS = (Math.floor(Date.now() / DAY_MS) + 1) * DAY_MS;

export function anchoredAt(time, offsetDays = 0) {
  const day = new Date(ANCHOR_DAY_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
  return new Date(`${day}T${time}Z`);
}
