from fastapi import FastAPI, Form
from fastapi.responses import Response
from twilio.twiml.messaging_response import MessagingResponse

app = FastAPI()

@app.get("/")
def home():
    return {"status": "running"}

@app.post("/whatsapp")
async def whatsapp(Body: str = Form(...), From: str = Form(...)):
    print(f"Message from {From}: {Body}")
    reply = MessagingResponse()
    reply.message(f"You said: {Body}")
    return Response(content=str(reply), media_type="application/xml")