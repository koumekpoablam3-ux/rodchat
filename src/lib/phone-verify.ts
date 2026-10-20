import { prisma } from "./prisma";
import { hashPhone } from "./phone-server";

/** Marque le numéro d'un compte comme vérifié. « taken » : un autre compte a déjà vérifié ce numéro. */
export async function markPhoneVerified(userId: string, phone: string): Promise<"ok" | "taken"> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { phone, verifiedPhone: phone, phoneVerifiedAt: new Date(), phoneHash: hashPhone(phone) },
    });
    await prisma.phoneVerification.deleteMany({ where: { userId } });
    return "ok";
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "taken";
    throw error;
  }
}

/** Retire la vérification (numéro changé, ou retirée par l'administrateur) */
export async function clearPhoneVerification(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { verifiedPhone: null, phoneVerifiedAt: null, phoneHash: null },
  });
}
