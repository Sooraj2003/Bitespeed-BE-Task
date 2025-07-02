import express from "express";
import { Request,Response } from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

app.post("/identity", async (req,res) : Promise<any>=>{
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber is required" });
  }

  // Step 1: Find all matching contacts (email or phone)
  const matchingContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: email || undefined },
        { phoneNumber: phoneNumber || undefined },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  let primaryContact;
  let allContacts: typeof matchingContacts = [];

  if (matchingContacts.length === 0) {
    // No match — create new PRIMARY contact
    primaryContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "PRIMARY",
      },
    });
    allContacts = [primaryContact];
  } else {
    // Step 2: Find all linked contacts (directly or indirectly)
    const allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: matchingContacts.map((c) => c.id) } },
          { linkedId: { in: matchingContacts.map((c) => c.id) } },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });

    allContacts = allLinkedContacts;

})
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
