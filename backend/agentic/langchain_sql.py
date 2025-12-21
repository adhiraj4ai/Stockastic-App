import os
from langchain_community.utilities import SQLDatabase
from langchain.chains import create_sql_query_chain
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools.sql_database.tool import QuerySQLDataBaseTool
from operator import itemgetter
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough

class LangChainSQLAgent:
    def __init__(self):
        # 1. Setup Database Connection (Targeting 'stock_market' specifically)
        # We construct the URI manually from environment vars matching settings.py
        user = os.environ.get("POSTGRES_USER", "postgres")
        password = os.environ.get("POSTGRES_PASSWORD", "postgres")
        host = os.environ.get("DB_HOST", "localhost")
        port = os.environ.get("DB_PORT", "5434")
        db_name = "stock_market" # Explicitly targeting the stock data DB
        
        # URI: postgresql+psycopg2://user:password@host:port/dbname
        self.db_uri = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"
        
        # Initialize LangChain SQLDatabase
        # include_tables can be used to filter if needed, but we'll let it introspect relevant ones 
        # or we could verify connection first.
        try:
            self.db = SQLDatabase.from_uri(self.db_uri)
        except Exception as e:
            print(f"Error connecting to stock_market DB: {e}")
            # Fallback (mostly for dev if DB is missing)
            self.db = None

        # 2. Setup LLM (Reusing logic from LLMFactory basically, but getting raw LangChain object)
        provider = os.environ.get("LLM_PROVIDER", "groq").lower()
        api_key = os.environ.get("LLM_API_KEY")
        
        if provider == "groq":
            self.llm = ChatGroq(
                groq_api_key=api_key,
                model_name="llama-3.3-70b-versatile",
                temperature=0
            )
        elif provider == "gemini":
             self.llm = ChatGoogleGenerativeAI(
                google_api_key=api_key,
                model="gemini-1.5-flash",
                temperature=0
            )

        # 3. Create Chains
        if self.db and self.llm:
            self.write_query = create_sql_query_chain(self.llm, self.db)
            self.execute_query = QuerySQLDataBaseTool(db=self.db)
    
    def run(self, question: str):
        if not self.db:
            return {"error": "Database connection failed."}

        try:
            # Step 1: Generate SQL
            generated_sql = self.write_query.invoke({"question": question})
            
            # Clean SQL (LangChain sometimes wrappers it in markdown)
            cleaned_sql = generated_sql.replace("```sql", "").replace("```", "").strip()
            
            # Step 2: Execute
            result = self.execute_query.invoke(cleaned_sql)
            
            return {
                "success": True,
                "sql": cleaned_sql,
                "data": result
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "sql": "Error generating/executing query"
            }
