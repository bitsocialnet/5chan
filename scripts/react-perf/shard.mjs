// Splits configured scenarios or routes across parallel CI jobs. Round-robin
// assignment gives every newly configured entry a shard without CI changes.
export function parseShard(value) {
  if (value === undefined) return null;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || index < 1 || index > count) throw new Error('--shard must be INDEX/COUNT with 1 <= INDEX <= COUNT, for example 1/3');
  return { index, count };
}

export const pickShard = (items, shard) => (shard ? items.filter((_, position) => position % shard.count === shard.index - 1) : items);
