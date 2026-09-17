import 'dotenv/config';
import prismaModule from './src/config/prisma.js';

const prisma = prismaModule?.default ?? prismaModule;

async function audit() {
  console.log("=== TIMESTAMP AUDIT ===");

  const userId = '47846f8d-46ae-4bc1-a832-462a37727ffe';
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  console.log("User details:");
  console.log(JSON.stringify(user, null, 2));
  
  if (user && user.email) {
    const match = user.email.match(/_deleted_(\d+)/);
    if (match) {
      const ts = Number(match[1]);
      console.log(`Email timestamp ${ts} is:`, new Date(ts).toISOString());
    }
  }

  const approval = await prisma.paymentApproval.findFirst({
    where: { approver_id: userId },
    include: {
      invoice: { select: { invoice_number: true, amount: true, status: true } }
    }
  });

  console.log("\nApproval details:");
  console.log(JSON.stringify(approval, null, 2));

  await prisma.$disconnect();
}

audit().catch(console.error);
