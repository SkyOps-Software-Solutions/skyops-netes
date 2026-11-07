# SkyOps — AI Provider Configuration & Privacy Guide

SkyOps offers flexible intelligence capabilities for incident diagnosis, root-cause analysis, and remediation suggestions. 

This guide explains how to configure AI providers and how our automated privacy engine protects customer credentials and sensitive infrastructure secrets.

---

## 1. Supported AI Providers

SkyOps supports four distinct provider options:

| Provider | Connectivity | Model Example | Data Transmission |
|---|---|---|---|
| **Deterministic Engine (No-AI)** *(Default)* | Offline | Heuristic Rule Engine | **Zero**. Operates completely within your server memory. |
| **Google Gemini** | Outbound HTTPS | `gemini-3.8-flash` | Anonymized and redacted incident context sent to Google Cloud Gemini API. |
| **OpenAI-Compatible** | Outbound HTTPS | `gpt-4o`, `gpt-4o-mini` | Compatible with OpenAI, Azure OpenAI, or LiteLLM gateways. |
| **Local Private Model** | Local Network | `llama3`, `mistral`, `deepseek` | Connects to your internal Ollama, vLLM, or LocalAI server. Zero public internet traffic. |

---

## 2. Configuring AI in the Dashboard

1. Navigate to **Settings** → **AI & Privacy**.
2. Select your **AI Provider**:
   - For **Google Gemini**:
     - Provider: `Google Gemini`
     - API Key: Enter your Gemini API key.
     - Model: `gemini-3.8-flash` (recommended for low latency and high accuracy).
   - For **OpenAI / Azure**:
     - Provider: `OpenAI Compatible`
     - Endpoint: `https://api.openai.com/v1` (or your Azure endpoint).
     - API Key: Enter your OpenAI API key.
     - Model: `gpt-4o`.
   - For **Local Inference (Ollama / vLLM)**:
     - Provider: `Local Inference (Ollama / vLLM)`
     - Endpoint: `http://ollama.internal:11434/v1`
     - Model: `llama3:8b`
     - API Key: *(Leave blank if internal)*.
3. **Data Sharing Consent**:
   - Check the **Authorize Data Sharing Consent** checkbox. External providers will refuse outbound calls if this consent gate is unchecked.
4. Click **Test Connection & Save**.

---

## 3. Automated Privacy Shield (`dataPrivacy.ts`)

To ensure compliance with GDPR, SOC 2, HIPAA, and corporate security policies, SkyOps automatically scrubs all sensitive tokens and credentials from telemetry data before passing it to any AI model:

### What Is Automatically Redacted:
1. **Bearer Tokens & JWTs**: Replaced with `Bearer [REDACTED_TOKEN]`.
2. **Database Passwords**: Stripped from connection strings (e.g., `postgresql://user:***@host:5432/db`).
3. **AWS & Cloud Keys**: Access keys (`AKIA...`) and secret keys scrubbed.
4. **Private Keys**: Full `-----BEGIN RSA/EC PRIVATE KEY-----` blocks eliminated.
5. **Environment Secrets**: Values associated with keys containing `password`, `passwd`, `pass`, `token`, `secret`, `apikey`, or `credential` are replaced with `[REDACTED_VALUE]`.
6. **Masked Credentials**: API keys stored in configuration are masked server-side (`sk-1••••••••90ab`) and never sent in plaintext to frontend browsers.

---

## 4. Human-in-the-Loop Safety Invariant

Even when an AI provider produces a high-confidence remediation recommendation:
- **No Automatic Infrastructure Mutation**: SkyOps will never execute a cluster change (e.g. pod deletion, deployment scaling, rollout) automatically based solely on an AI output.
- **Mandatory Approval**: An authorized engineer with `OPERATOR`, `ADMIN`, or `OWNER` role must inspect the proposed command, review the blast-radius risk level, and click **Approve & Execute**.
- **Audit Trail**: Every execution is logged to the `audit_logs` database table with the operator ID and timestamp.
