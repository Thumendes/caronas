import { createGateway } from '@ai-sdk/gateway';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { findRider, listRiders, saveRider, upsertRide } from './db';
import { fmtDate, money, todayBR, type Env } from './lib';
import { renderReport } from './views';

/** Interpreta mensagens livres ("deixei o Guilherme na namorada, 7 reais") e executa via tools. */
export async function handleFreeText(env: Env, message: string): Promise<string> {
  const db = env.DB;
  const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
  const today = todayBR();
  const riders = await listRiders(db);

  const { text } = await generateText({
    model: gateway(env.AI_MODEL),
    system: [
      'Você é o assistente de caronas do dono deste bot, um estudante que dá carona na volta da faculdade (à noite).',
      'Cada carona tem um valor padrão por caroneiro, mas às vezes o destino muda e o valor também (ex: "deixei o Guilherme na namorada, 7 reais").',
      'Use as ferramentas para registrar/alterar caronas e caroneiros. Nunca invente valores: se não disser valor, use o padrão.',
      'Datas relativas ("ontem", "sexta") devem ser convertidas a partir de hoje.',
      'Responda em português, curto e direto, confirmando o que foi feito.',
      `Hoje é ${fmtDate(today)} (${today}).`,
      `Caroneiros: ${riders.map((r) => `${r.name} (padrão ${money(r.default_price)})`).join('; ') || 'nenhum'}.`,
    ].join('\n'),
    prompt: message,
    stopWhen: isStepCount(6),
    tools: {
      registrarCarona: tool({
        description: 'Registra (ou corrige) se houve carona para um caroneiro em uma data.',
        inputSchema: z.object({
          nome: z.string(),
          data: z.string().describe('YYYY-MM-DD'),
          foi: z.boolean().describe('true se deu carona, false se não'),
          valor: z.number().optional().describe('Valor em reais; omita para usar o padrão'),
          obs: z.string().optional().describe('Destino/observação, ex: "casa da namorada"'),
        }),
        execute: async ({ nome, data, foi, valor, obs }) => {
          const rider = await findRider(db, nome);
          if (!rider) return { erro: `Caroneiro "${nome}" não encontrado` };
          const price = valor != null ? Math.round(valor * 100) : rider.default_price;
          await upsertRide(db, { riderId: rider.id, date: data, went: foi, price, note: obs });
          return { ok: true, nome: rider.name, data: fmtDate(data), foi, valor: money(foi ? price : 0) };
        },
      }),
      salvarCaroneiro: tool({
        description: 'Cadastra um caroneiro novo ou altera o valor padrão de um existente.',
        inputSchema: z.object({ nome: z.string(), valorPadrao: z.number().describe('Em reais') }),
        execute: async ({ nome, valorPadrao }) => {
          const r = await saveRider(db, nome, Math.round(valorPadrao * 100));
          return { ok: true, nome: r.name, valorPadrao: money(r.default_price) };
        },
      }),
      relatorio: tool({
        description: 'Relatório de um mês: caronas e valor a cobrar de cada um.',
        inputSchema: z.object({ mes: z.string().describe('YYYY-MM') }),
        execute: async ({ mes }) => ({ relatorio: await renderReport(db, mes) }),
      }),
    },
  });

  return text;
}
