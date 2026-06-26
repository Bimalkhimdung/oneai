import ollama
import chromadb

chroma_client = chromadb.Client()

collection = chroma_client.create_collection(name="custome knowlagebase")

documents = [
    "The office kitchen coffee machine password is 'Espresso2026!'. Do not share it.",
    "The remote work policy allows employees to work from anywhere up to 3 days per week.",
    "For IT support and hardware requests, open a ticket at helpdesk.internal.net.",
    "The annual company retreat for 2026 will take place in Kyoto, Japan, during October."
]
collection.add(
        documents=documents,
        ids=["f.id_{i}" for i in range(len(documents))]

        )


print("data inseted into the database")

user_query = "Where are we going for the company retreat this year?"

print(f"\nUser Question: {user_query}")

results = collection.query(
                query_text=[user_query],
                n_result=1
                )

retrieved_context= results['documents'][0][0]

print(f"Retrieved Context Match: '{retrieved_context}'")
augmented_prompt = f"""
You are a helpful company assistant. Answer the user's question accurately using ONLY the context provided below. 
If you do not know the answer based on the context, say "I cannot find that in the knowledge base."

Context: 
{retrieved_context}

Question: 
{user_query}

Answer:
"""

# Feed the augmented prompt directly into the LLM's active context window [cite: 283, 413]
response = ollama.generate(
    model='llama3', 
    prompt=augmented_prompt
)

print("\n--- LLM Final Response ---")
print(response['response'])




