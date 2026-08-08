# „Atminimas“ pagalbos chatbotas

Funkcija naudoja OpenAI Responses API, o oficiali svetainės informacija laikoma
`knowledge-base.ts`. Naujam klausimui ar pasikeitus svetainei papildykite arba
atnaujinkite vieną `ATMINIMAS_KNOWLEDGE_BASE` masyvo objektą ir testus.

Prieš diegimą Supabase Edge Function Secrets saugykloje nustatykite:

```text
OPENAI_API_KEY=...
OPENAI_CHATBOT_MODEL=gpt-5.6-luna
```

Pirmiausia pritaikykite `help_chatbot_rate_limit` migraciją, tada įdiekite
`help-chatbot` funkciją. API raktas negali būti kopijuojamas į frontend failus.
