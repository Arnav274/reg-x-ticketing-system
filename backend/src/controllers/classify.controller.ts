import { Request, Response } from "express";
import { classifyIssue, NO_SUGGESTION } from "../services/aiClassifier.service";

export async function classifyController(
  req: Request,
  res: Response
): Promise<void> {
  // Shape and length are guaranteed by validateClassify.middleware, which runs
  // ahead of this controller in the route chain, the same way
  // createTicketController trusts validate.middleware.
  const { issue_description } = req.body as { issue_description: string };

  const suggestedCategory = await classifyIssue(issue_description);

  // null still means the call failed: bad status, timeout, unparseable body, or
  // a label outside the allowed set.
  if (suggestedCategory === null) {
    res.status(502).json({
      error: "AI classification is currently unavailable. Please choose a category manually.",
    });
    return;
  }

  // A decline is a successful classification that happens to have no category
  // in it, so it is a 200 carrying null rather than the 502 above. Reusing the
  // 502 would need no frontend change at all and is still wrong: it would
  // report a healthy provider as a bad gateway, make this endpoint's error rate
  // useless as a provider-health signal, and tell a user whose AI worked
  // perfectly that the AI is unavailable.
  res.status(200).json({
    suggested_category: suggestedCategory === NO_SUGGESTION ? null : suggestedCategory,
  });
}
