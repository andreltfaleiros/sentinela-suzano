// Vercel Function — SENTINELA · Salvar Observação de Campo (Perfil Auditor)
// Recebe os dados de uma observação TEM e salva na tabela observacoes_campo
// Acesso restrito ao perfil auditor (autenticação via senha no frontend)

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração Supabase ausente' });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  const {
    area,
    turno,
    ameacas,
    ameaca_desc,
    resposta_operador,
    erro_ocorreu,
    obs_livre,
  } = req.body || {};

  if (!area) {
    return res.status(400).json({ error: 'Campo obrigatório: área' });
  }

  try {
    const { error } = await sb.from('observacoes_campo').insert([{
      area,
      turno: turno || null,
      ameacas: ameacas || [],
      ameaca_desc: ameaca_desc || null,
      resposta_operador: resposta_operador || null,
      erro_ocorreu: erro_ocorreu || null,
      obs_livre: obs_livre || null,
      criado_em: new Date().toISOString(),
    }]);

    if (error) throw error;

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('Erro ao salvar observação:', e);
    return res.status(500).json({ error: 'Falha ao salvar', detail: e.message });
  }
};
