import { roundMetric } from './statistics.calculator.js';
import { taskStatusDistribution } from './flow-task.calculator.js';

const count = (value) => Number(value ?? 0);
const hours = (value) => (value == null ? null : roundMetric(Number(value)));

export function calculateTaskCurrent(aggregate, statusRows) {
  return {
    total: count(aggregate.total),
    wip: count(aggregate.wip),
    overdue: count(aggregate.overdue),
    unassigned: count(aggregate.unassigned),
    withoutEstimate: count(aggregate.withoutEstimate),
    withEstimate: count(aggregate.withEstimate),
    estimatedHours: hours(aggregate.estimatedHours),
    withActual: count(aggregate.withActual),
    actualHours: hours(aggregate.actualHours),
    comparable: count(aggregate.comparable),
    completedComparable: count(aggregate.completedComparable),
    completedWithEstimate: count(aggregate.completedWithEstimate),
    differenceHours: hours(aggregate.differenceHours),
    above: count(aggregate.above),
    below: count(aggregate.below),
    statuses: taskStatusDistribution(statusRows)
  };
}
