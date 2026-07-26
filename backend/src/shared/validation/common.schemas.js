import { z } from 'zod';
import { isAllowedGithubUrl } from '../security/ssrf.js';

export const INPUT_LIMITS = Object.freeze({
  shortText: 191,
  search: 255,
  url: 191,
  accessCode: 32,
  hash: 191
});

function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const positiveInteger = (message = 'Informe um ID inteiro positivo.') =>
  z.preprocess(
    (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
    z.number({ error: message }).int(message).positive(message)
  );

export const requiredText = ({
  field = 'Campo',
  max = INPUT_LIMITS.shortText,
  message = `${field} obrigatório.`
} = {}) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `${field} deve possuir no máximo ${max} caracteres.`);

export const optionalText = ({ field = 'Campo', max = INPUT_LIMITS.shortText } = {}) =>
  z
    .union([
      z.string().trim().max(max, `${field} deve possuir no máximo ${max} caracteres.`),
      z.null()
    ])
    .optional();

export const searchText = z
  .string()
  .trim()
  .max(INPUT_LIMITS.search, `Busca deve possuir no máximo ${INPUT_LIMITS.search} caracteres.`)
  .optional();

export const queryBoolean = z.union([
  z.literal('true').transform(() => true),
  z.literal('false').transform(() => false)
]);

export const dateOnly = (label = 'Data') =>
  z.string().refine(isValidDateOnly, `${label} inválida. Use o formato YYYY-MM-DD.`);

export const optionalDateOnly = (label = 'Data') => dateOnly(label).optional();

export const isoDateTime = (label = 'Data e hora') =>
  z
    .string()
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        !Number.isNaN(Date.parse(value)),
      `${label} deve estar em formato ISO-8601.`
    );

export const httpUrl = (label = 'URL') =>
  z
    .string({ error: `${label} inválida.` })
    .trim()
    .max(INPUT_LIMITS.url, `${label} deve possuir no máximo ${INPUT_LIMITS.url} caracteres.`)
    .refine((value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, `${label} inválida.`);

export const githubUrl = httpUrl('URL GitHub').refine(
  isAllowedGithubUrl,
  'URL GitHub inválida. Use HTTPS e um host oficial do GitHub.'
);

export const email = z
  .string({ error: 'E-mail inválido.' })
  .trim()
  .max(INPUT_LIMITS.shortText, 'E-mail deve possuir no máximo 191 caracteres.')
  .email('E-mail inválido.');

export const strictObject = (shape) => z.strictObject(shape);

export const emptyObject = strictObject({});
export const emptyBodySchema = z.union([z.undefined(), emptyObject]).transform(() => ({}));

export const dateRangeSchema = strictObject({
  startDate: optionalDateOnly('Data inicial'),
  endDate: optionalDateOnly('Data final')
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
  }
});

export const paginationSchema = Object.freeze({
  page: positiveInteger('page deve ser um inteiro maior ou igual a 1.').optional(),
  limit: positiveInteger('limit deve ser um inteiro entre 1 e 100.')
    .refine((value) => value <= 100, 'limit deve ser um inteiro entre 1 e 100.')
    .optional()
});
