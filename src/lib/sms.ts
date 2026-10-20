// Envoi de SMS (facultatif). Sans service d'envoi configuré, la vérification par SMS n'existe pas : l'administrateur
// peut alors vérifier les numéros à la main (espace admin → Utilisateurs). Le seul service pris en charge pour
// l'instant est Twilio ; d'autres se branchent ici, dans `sendSms`.
//
// Variables : SMS_PROVIDER="twilio", TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, et soit TWILIO_FROM (numéro ou nom
// d'expéditeur), soit TWILIO_MESSAGING_SERVICE_SID.

export function smsAvailable(): boolean {
  return (
    process.env.SMS_PROVIDER === "twilio" &&
    Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

/** Envoie un SMS. Renvoie false (sans lever d'erreur) si l'envoi échoue. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!smsAvailable()) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;

  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM as string);

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      console.error("[sms] Twilio a refusé l'envoi :", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[sms] envoi impossible :", error instanceof Error ? error.message : error);
    return false;
  }
}
