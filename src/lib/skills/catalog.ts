/**
 * The skill catalog — every skill we can name, and the group it belongs to.
 *
 * WHY A WRITTEN TABLE AND NOT AN AI CALL. Grouping is a display decision made on every
 * profile view; an LLM would cost a call per candidate, drift between candidates (the
 * same person's Python landing in "Back-End" today and "Data" tomorrow), and could not
 * be unit-tested. A table is instant, free, reproducible and correctable.
 *
 * WHY IT IS SAFE TO BE A FIXED TAXONOMY. A skill we have never seen still renders — it
 * falls into "Additional Skills". A miss is cosmetic. That is the difference between
 * this and a role taxonomy, where a miss silently excludes a person.
 *
 * WHAT IT CANNOT DO. Measured over every skill string in the database: 1,480 distinct
 * strings across 3,196 mentions, and 74% of the strings appear exactly ONCE
 * ("Asynchronous Advantageous Actor-Critic (A3C)", "Total Logistics Cost assessment").
 * No table reaches those. The realistic target is ~75% of a given person's chips
 * grouped, the rest under "Additional Skills" — which is what Juicebox does too.
 * `npm run audit:skills` prints what is still uncategorised, by frequency, so topping
 * this file up stays a ten-minute job rather than a rewrite.
 *
 * FORMAT. `'Canonical Label|alias|alias'` — the first spelling is what we display, the
 * rest are spellings that mean the same thing. Normalisation (see index.ts) already
 * collapses case and punctuation, so "Node.js"/"NodeJS"/"Node js" need no alias; only
 * genuinely different words do ("Node", "GoLang", "MS Excel").
 *
 * MATCHING IS EXACT, NEVER SUBSTRING. Substring matching is how "Java" swallows
 * "JavaScript". Every lookup here is on the whole normalised string.
 */

/** Categories in tie-break order. A profile only ever shows the ones it has. */
export const CATEGORY_ORDER = [
  // Engineering
  'Programming Languages',
  'Front-End',
  'Back-End & APIs',
  'Mobile',
  'Databases',
  'Data Engineering',
  'AI / ML',
  'Data Science & Statistics',
  'Cloud & Infrastructure',
  'DevOps & Reliability',
  'Security',
  'QA & Testing',
  'Architecture & Systems',
  'Embedded & Hardware',
  'Blockchain & Web3',
  'Game & Graphics',
  // Design
  'Product Design & UX',
  'Visual & Brand Design',
  // Product
  'Product Management',
  'Project & Program Management',
  // Marketing
  'Marketing Strategy',
  'Performance Marketing',
  'SEO & Content',
  'Social & Community',
  'Lifecycle & CRM Marketing',
  'Product & Growth Analytics',
  'Business Intelligence',
  'PR & Communications',
  // Sales
  'Sales & Business Development',
  'Account Management & Customer Success',
  'Sales Operations & Enablement',
  'Partnerships & Alliances',
  // Finance
  'Accounting & Reporting',
  'Financial Planning & Analysis',
  'Investment & Capital Markets',
  'Tax, Audit & Controls',
  'Treasury & Risk',
  // People
  'Talent Acquisition',
  'People Operations',
  'Learning & Development',
  'Compensation & Benefits',
  // Operations
  'Business Operations & Strategy',
  'Supply Chain & Logistics',
  'Manufacturing & Quality',
  'Procurement & Vendor Management',
  'Customer Support Operations',
  // Specialist domains
  'Legal & Compliance',
  'Healthcare & Life Sciences',
  'Research & Science',
  'Education & Training',
  'Industry Domains',
  // Cross-cutting
  'Leadership & Management',
  'Communication & Collaboration',
  'Spoken Languages',
  // Always last
  'Additional Skills',
] as const

export type SkillCategory = (typeof CATEGORY_ORDER)[number]

/** The catch-all every unrecognised skill lands in. */
export const FALLBACK_CATEGORY: SkillCategory = 'Additional Skills'

/**
 * Workflow tools, dropped from the profile entirely rather than grouped. An IDE, a
 * ticket tracker or a chat app is not a skill — listing Vim next to Distributed Systems
 * flattens a profile into noise. Domain tools a job is actually done in (Figma,
 * Tableau, Salesforce, Excel) are NOT here: they stay, in their own categories.
 */
export const DROPPED_TOOLS = [
  'VS Code|Visual Studio Code|VSCode', 'Vim|Neovim|NVim', 'Emacs', 'Sublime Text',
  'IntelliJ|IntelliJ IDEA', 'PyCharm', 'Eclipse', 'Xcode', 'Android Studio',
  'Jira', 'Confluence', 'Trello', 'Asana', 'Monday.com', 'Linear', 'ClickUp', 'Basecamp',
  'Slack', 'Microsoft Teams', 'Zoom', 'Discord',
  'GitHub|Git Hub', 'GitLab', 'Bitbucket', 'Sourcetree',
  'Postman|Insomnia', 'Swagger|OpenAPI Editor',
  'Notion', 'Evernote', 'Obsidian',
  'Windows', 'macOS|Mac OS', 'Ubuntu', 'Microsoft Office|MS Office',
  'Microsoft Word|MS Word', 'Microsoft PowerPoint|MS PowerPoint|Powerpoint',
  'Google Workspace|G Suite', 'Google Docs', 'Google Sheets', 'Google Slides',
]

/**
 * The catalog. Grouped by category; each entry is `Canonical|alias|alias`.
 */
export const SKILL_CATALOG: Record<SkillCategory, string[]> = {
  'Programming Languages': [
    'Python', 'Java', 'JavaScript|JS|ES6|ECMAScript', 'TypeScript', 'C', 'C++|CPP|Boost C++',
    'C#|C Sharp|CSharp', 'Go|Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala',
    'Dart', 'R', 'MATLAB', 'Perl', 'Haskell', 'Elixir', 'Erlang', 'Clojure', 'Lua',
    'Objective-C', 'Groovy', 'Julia', 'F#', 'OCaml', 'Zig', 'Assembly', 'COBOL', 'Fortran',
    'Visual Basic|VB.NET', 'Solidity', 'Bash|Shell|Shell Scripting|Bash Scripting',
    'PowerShell', 'SQL', 'PL/SQL', 'T-SQL', 'LaTeX', 'C/C++',
  ],
  'Front-End': [
    'React|React.js|ReactJS', 'Next.js|Next', 'Vue.js|Vue|VueJS', 'Angular|AngularJS',
    'Svelte|SvelteKit', 'HTML|HTML5', 'CSS|CSS3', 'HTML/CSS', 'Sass|SCSS', 'Less',
    'Tailwind CSS|TailwindCSS|Tailwind', 'Bootstrap', 'Material UI|Material-UI|MUI',
    'Ant Design', 'Chakra UI', 'Radix UI', 'shadcn/ui', 'Redux', 'Zustand', 'MobX',
    'React Query|TanStack Query', 'Recoil', 'jQuery', 'Webpack', 'Vite', 'Babel',
    'Rollup', 'Parcel', 'Storybook', 'Framer Motion', 'GSAP|Greensock',
    'Three.js', 'D3.js|D3', 'Chart.js', 'Web Components', 'Responsive Design',
    'Accessibility|a11y|Web Accessibility', 'Progressive Web Apps|PWA',
    'Server-Side Rendering|SSR', 'Static Site Generation|SSG',
    'Frontend Development|Front-End Development|Frontend', 'DOM|Document Object Model',
    'AJAX', 'Electron', 'Astro', 'Remix', 'Nuxt.js|Nuxt', 'Micro-frontends|Microfrontend Architecture',
  ],
  'Back-End & APIs': [
    'Node.js|Node|Node JS', 'Express.js|Express|ExpressJS', 'NestJS', 'Django',
    'Flask', 'FastAPI', 'Spring|Spring Framework', 'Spring Boot|SpringBoot',
    'Spring MVC', 'Spring Security', 'Spring Data JPA|JPA', 'Hibernate', 'J2EE|Java EE',
    'JSP', 'JDBC', 'Ruby on Rails|Rails', 'Laravel', 'Symfony', 'ASP.NET|.NET|.NET Core',
    'Gin', 'Fiber', 'Echo', 'Phoenix', 'Koa', 'Fastify', 'Strapi',
    'REST|REST API|REST APIs|RESTful APIs|RESTful|API|APIs', 'GraphQL', 'gRPC', 'tRPC',
    'WebSockets', 'Webhooks', 'OAuth|OAuth2', 'JWT', 'Session Management',
    'Microservices|Microservice Architecture|Microservices Architecture',
    'Serverless', 'Celery', 'RabbitMQ', 'Message Queues', 'Nginx', 'Apache',
    'Backend Development|Backend|Back-End Development', 'Pydantic', 'Web Development',
    'Caching', 'Rate Limiting', 'API Design', 'API Integration|System Integration',
  ],
  'Mobile': [
    'Android|Android Development', 'iOS|iOS Development', 'React Native', 'Flutter',
    'SwiftUI', 'Jetpack Compose', 'Kotlin Coroutines', 'MVVM', 'Model-View-Presenter|MVP',
    'Mobile Development', 'Cross-Platform Frameworks|Cross-Platform Development',
    'Ionic', 'Xamarin', 'App Store Optimization|ASO',
  ],
  'Databases': [
    'Databases|Database', 
    'PostgreSQL|Postgres', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle Database|Oracle DB',
    'SQL Server|Microsoft SQL Server|MSSQL', 'MariaDB', 'Cassandra', 'DynamoDB',
    'Firebase|Firestore', 'Supabase', 'Neo4j', 'CouchDB', 'InfluxDB', 'ClickHouse',
    'Elasticsearch|ElasticSearch', 'Pinecone', 'Weaviate', 'Chroma', 'pgvector',
    'NoSQL', 'RDBMS', 'DBMS|Database Management', 'Database Design', 'Data Modeling',
    'Query Optimization', 'Indexing', 'DML', 'DDL', 'TCL', 'Stored Procedures',
  ],
  'Data Engineering': [
    'Apache Spark|Spark|PySpark', 'Apache Kafka|Kafka', 'Airflow|Apache Airflow',
    'dbt', 'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'Hadoop', 'Hive', 'Presto',
    'Flink', 'ETL|ELT|ETL Pipelines', 'Data Pipelines|Data Pipeline Design',
    'Data Warehousing|Data Warehouse', 'Data Lake', 'Data Processing', 'Big Data',
    'Stream Processing', 'Batch Processing', 'Data Extraction', 'Data Collection',
    'Data Quality', 'Data Governance', 'Luigi', 'Dagster', 'Fivetran',
  ],
  'AI / ML': [
    'Adam Optimizer', 'Sparse Autoencoders', 'LLM Interpretability', 'Claude API', 'Gemini API', 'LLM-Assisted Development', 'AI-Native Delivery Models', 'Model Evaluation', 'Guardrails', 'Diffusion Models', 'GANs', 'Attention Mechanisms', 
    'Machine Learning|ML', 'Deep Learning', 'Artificial Intelligence|AI',
    'Natural Language Processing|NLP', 'Computer Vision|CV', 'Reinforcement Learning|RL',
    'PyTorch|Pytorch|Torch', 'TensorFlow|Tensorflow', 'Keras', 'Scikit-learn|sklearn',
    'XGBoost', 'LightGBM', 'Hugging Face|HuggingFace|Transformers',
    'LangChain|Langchain', 'LlamaIndex', 'DSPy', 'LiteLLM', 'Langfuse', 'MLflow|MLFlow',
    'Vertex AI', 'OpenAI', 'Anthropic', 'Gemini', 'LLMs|Large Language Models|LLM',
    'VLMs|Vision Language Models', 'RAG|Retrieval Augmented Generation',
    'Prompt Engineering', 'Fine-tuning', 'Embeddings', 'Vector Search',
    'Neural Networks', 'CNN|Convolutional Neural Networks', 'RNN', 'LSTM',
    'Object Detection', 'Image Processing', 'Speech Recognition',
    'Recommendation Systems|Recommender Systems', 'Anomaly Detection',
    'Predictive Modeling', 'Federated Learning', 'MLOps', 'Model Deployment',
    'Feature Engineering', 'OpenCV', 'Ray', 'GenAI Engineering|GenAI',
    'AI Agents|Agentic AI', 'MCP|Model Context Protocol', 'Information Retrieval',
    'Information Extraction', 'Semantic Search',
  ],
  'Data Science & Statistics': [
    'Monte Carlo Simulation', 'Multiple Regression', 'Quantitative Methods|Quantitative Analysis', 'Dash', 'Bayesian Statistics', 'Probability', 'Linear Algebra', 'Optimization', 
    'Pandas', 'NumPy', 'SciPy', 'Matplotlib', 'Seaborn', 'Plotly', 'Jupyter|Jupyter Notebook',
    'Statistical Analysis|Statistics', 'Data Analysis|Data Analytics',
    'Data Visualization|Data & Information Visualization', 'Hypothesis Testing',
    'A/B Testing|Split Testing|Product A/B Testing', 'Regression Analysis',
    'Time Series Analysis', 'Clustering', 'Classification', 'Experiment Design',
    'Data Science', 'Exploratory Data Analysis|EDA', 'Forecasting', 'Econometrics',
    'SPSS', 'Stata', 'SAS',
  ],
  'Cloud & Infrastructure': [
    'AWS|Amazon Web Services', 'GCP|Google Cloud|Google Cloud Platform', 'Azure|Microsoft Azure',
    'EC2', 'S3', 'Lambda|AWS Lambda', 'Cognito', 'EKS', 'GKE', 'EKS/GKE', 'ECS', 'RDS',
    'CloudFront', 'Route 53', 'VPC', 'IAM', 'Heroku', 'Vercel', 'Netlify', 'Render',
    'DigitalOcean', 'Cloudflare', 'Linux', 'Unix', 'Networking', 'Load Balancing',
    'Cloud Computing|Cloud-native platforms|Cloud Native', 'Infrastructure',
    'Scalability', 'High Availability', 'Distributed Systems',
    'Virtualization', 'VMware', 'Tailscale', 'Raspberry Pi',
  ],
  'DevOps & Reliability': [
    'Maven', 'Gradle', 'npm', 'Yarn', 'pnpm', 'Make', 'Bazel', 
    'Docker', 'Docker Compose', 'Kubernetes|K8s', 'Helm', 'Karpenter', 'Terraform',
    'Ansible', 'Puppet', 'Chef', 'Pulumi', 'Jenkins', 'GitHub Actions', 'GitLab CI',
    'CircleCI', 'Travis CI', 'ArgoCD', 'CI/CD|CI/CD Pipelines|Continuous Integration',
    'Continuous Deployment', 'Git', 'Prometheus', 'Grafana', 'Loki', 'Datadog',
    'Sentry', 'New Relic', 'Sumo Logic', 'Kibana', 'OpenTelemetry', 'LLMObs',
    'Observability', 'Monitoring', 'Logging', 'Site Reliability Engineering|SRE',
    'Incident Management', 'Root Cause Analysis|RCA', 'DevOps', 'Platform Engineering',
    'Infrastructure as Code|IaC|Architecture as Code', 'Resilience Engineering',
    'Performance Engineering|Performance Optimization', 'Capacity Planning',
  ],
  'Security': [
    'Cybersecurity|Information Security|InfoSec', 'Application Security|AppSec',
    'Penetration Testing|Pen Testing', 'Vulnerability Assessment', 'Threat Modeling',
    'Encryption|Cryptography', 'Network Security', 'Cloud Security', 'IAM Policies',
    'SOC 2', 'ISO 27001', 'OWASP', 'Security Auditing', 'Identity Management',
    'Zero Trust', 'SIEM', 'Ethical Hacking', 'Malware Analysis', 'Forensics',
  ],
  'QA & Testing': [
    'Unit Testing', 'Integration Testing', 'End-to-End Testing|E2E Testing',
    'Test Automation|Automation Testing', 'Manual Testing', 'Testing',
    'Jest', 'Mocha', 'Chai', 'Cypress', 'Playwright', 'Selenium', 'Puppeteer',
    'JUnit', 'Mockito', 'PyTest|pytest', 'TestNG', 'Appium', 'Load Testing',
    'Performance Testing', 'Regression Testing', 'Test Driven Development|TDD',
    'Behaviour Driven Development|BDD', 'Quality Assurance|QA',
  ],
  'Architecture & Systems': [
    'System Design', 'Systems Architecture|Software Architecture', 'Design Patterns',
    'Object-Oriented Programming|OOP|OOPS', 'Functional Programming',
    'Domain-Driven Design|DDD', 'Event-Driven Architecture|Event-driven systems',
    'Data Structures', 'Algorithms', 'Data Structures and Algorithms|DSA',
    'Operating Systems|OS', 'Computer Networks', 'Compilers', 'Concurrency',
    'Multithreading', 'Computer Science', 'Software Development|Software Engineering',
    'Software Development Life Cycle|SDLC', 'Code Review', 'Refactoring',
    'Technical Strategy', 'Platform Modernisation|Platform Modernization',
    'Evolutionary Architecture', 'Data-Intensive Systems', 'Technical Documentation',
  ],
  'Embedded & Hardware': [
    'Drone Control|UAV Control', 'Sensors', 'Mechatronics', 
    'Embedded Systems', 'Firmware', 'RTOS', 'Arduino', 'Microcontrollers',
    'VHDL', 'Verilog', 'FPGA', 'PCB Design', 'IoT|Internet of Things',
    'Robotics', 'Signal Processing', 'Control Systems', 'CAD|AutoCAD|SolidWorks',
  ],
  'Blockchain & Web3': [
    'Blockchain', 'Ethereum', 'Smart Contracts', 'Web3', 'DeFi', 'NFT',
    'Hardhat', 'Truffle', 'Cryptocurrency', 'Consensus Algorithms',
  ],
  'Game & Graphics': [
    'Unity', 'Unreal Engine', 'Game Development', 'Blender', 'Maya', '3D Modeling',
    'Animation', 'OpenGL', 'WebGL', 'Shaders', 'Rendering', 'Computer Graphics',
  ],
  'Product Design & UX': [
    'UI/UX Design|UI/UX|UX/UI', 'User Experience|UX|UX Design', 'User Interface Design|UI Design',
    'Figma', 'Sketch', 'Adobe XD', 'InVision', 'Framer', 'Miro',
    'Wireframing', 'Prototyping', 'Design Systems', 'Interaction Design',
    'User Research', 'Usability Testing', 'Information Architecture',
    'Design Thinking', 'User-Centric Design Principles|User-Centered Design',
    'Accessibility Design', 'Mobile Design', 'Journey Mapping', 'Persona Development',
  ],
  'Visual & Brand Design': [
    'Graphic Design', 'Adobe Photoshop|Photoshop', 'Adobe Illustrator|Illustrator',
    'Adobe InDesign|InDesign', 'Adobe Premiere|Premiere Pro', 'After Effects',
    'Canva', 'Brand Identity', 'Typography', 'Visual Design', 'Motion Graphics',
    'Video Editing', 'Photography', 'Illustration', 'Print Design', 'Packaging Design',
  ],
  'Product Management': [
    'Product Management', 'Product Strategy|Product Roadmap & Strategy|Product Planning and Strategy',
    'Product Roadmap|Roadmapping', 'Product Discovery', 'Requirements Gathering',
    'User Stories', 'Backlog Management|Backlog Grooming', 'Product Analytics',
    'Product Marketing', 'Product Positioning', 'Go-to-Market Strategy|GTM Strategy|Go To Market',
    'Product Launch', 'Feature Prioritization', 'MVP Development',
    'Product Operations', 'Competitive Analysis', 'Voice of Customer',
    'Product-Led Growth|PLG', '0 → 1 Team Building|0 to 1|Zero to One',
  ],
  'Project & Program Management': [
    'Project Management', 'Program Management|Cross-Functional Program Leadership',
    'Agile|Agile Methodology|Agile Methodologies|Agile & Scrum Methodologies',
    'Scrum', 'Kanban', 'Waterfall', 'SAFe', 'Sprint Planning', 'Resource Planning',
    'Risk Mitigation', 'Stakeholder Management|Stakeholder Management & Cross-functional Communication',
    'Cross-Functional Leadership|Cross-functional Collaboration',
    'Process Design|Scalable Process Design|Process Improvement',
    'Change Management', 'PMP', 'Milestone Tracking',
    'Problem effort breakdown and estimation|Estimation',
  ],
  'Marketing Strategy': [
    'Marketing Strategy', 'Brand Management|Branding', 'Brand Strategy',
    'Market Research|Market Research & Competitive benchmarking', 'Market Analysis',
    'Competitive Benchmarking', 'Customer Segmentation|Customer Segmentation & Personalization',
    'Positioning', 'Messaging', 'Marketing Communications', 'Integrated Marketing',
    'Product Marketing Strategy', 'Pricing Strategy', 'Campaign Management',
    'Marketing Automation', 'Growth Marketing|Growth Hacking', 'Demand Generation',
    'International Expansion', 'Channel Optimisation|Channel Optimization|Channel Strategy',
  ],
  'Performance Marketing': [
    'Performance Marketing', 'Paid Media', 'Google Ads|Google AdWords|AdWords',
    'Meta Ads|Facebook Ads', 'LinkedIn Ads', 'Programmatic Advertising',
    'PPC|Pay Per Click', 'Media Buying', 'Conversion Rate Optimization|CRO',
    'Retargeting', 'Attribution Modeling', 'Budget Management',
    'Digital Marketing', 'Affiliate Marketing', 'Display Advertising',
  ],
  'SEO & Content': [
    'SEO|Search Engine Optimization', 'SEM|Search Engine Marketing',
    'Keyword Research', 'Link Building', 'Technical SEO', 'On-Page SEO',
    'Content Strategy', 'Content Writing|Content Creation', 'Copywriting',
    'Blogging', 'Editorial Planning', 'Content Marketing', 'Technical Writing',
    'Report Writing', 'Storytelling', 'Ahrefs', 'SEMrush', 'Google Search Console',
  ],
  'Social & Community': [
    'Social Media Management|Social Media', 'Social Media Marketing',
    'Community Management|Community Building', 'Influencer Marketing',
    'Instagram Marketing', 'LinkedIn Marketing', 'X Marketing|Twitter Marketing',
    'YouTube Marketing', 'Content Calendar', 'Engagement Strategy', 'Hootsuite', 'Buffer',
  ],
  'Lifecycle & CRM Marketing': [
    'Email Marketing', 'Lifecycle Marketing|User Retention and Lifecycle Management',
    'Marketing CRM', 'HubSpot|Hubspot', 'Mailchimp', 'Klaviyo', 'Braze',
    'MoEngage', 'CleverTap', 'Karix', 'Customer.io', 'SendGrid',
    'Push Notifications', 'Drip Campaigns', 'Retention Strategy', 'Churn Reduction',
    'Personalization', 'Customer Journey Mapping',
  ],
  'Product & Growth Analytics': [
    'Google Analytics|GA4', 'Mixpanel', 'Amplitude', 'Segment', 'Heap',
    'Funnel Analytics|Funnel Analysis|Funnel & Marketplace Analytics',
    'Cohort Analysis', 'Marketing Attribution', 'Digital Growth Metrics & Analytics',
    'Google Tag Manager', 'Analytics', 'Retention Analysis', 'Conversion Analysis',
    'Event Tracking', 'North Star Metrics',
  ],
  'Business Intelligence': [
    'Tableau', 'Power BI|PowerBI', 'Looker', 'Metabase', 'Apache Superset|Superset',
    'Excel|Microsoft Excel|MS Excel', 'Google Data Studio|Looker Studio', 'Qlik',
    'Dashboarding|Dashboard Design', 'Reporting', 'Business Intelligence|BI',
    'Pivot Tables', 'VBA|Excel VBA', 'Advanced Excel',
  ],
  'PR & Communications': [
    'Public Relations|PR', 'Media Relations', 'Press Releases', 'Crisis Communications',
    'Internal Communications', 'Corporate Communications', 'Event Management',
    'Speechwriting', 'Thought Leadership', 'Analyst Relations',
  ],
  'Sales & Business Development': [
    'Lead Conversion', 'Sales Funnel', 
    'Sales', 'Business Development|BD', 'B2B Sales', 'B2C Sales', 'Enterprise Sales',
    'Inside Sales', 'Field Sales', 'Solution Selling', 'Consultative Selling',
    'Lead Generation', 'Prospecting', 'Cold Calling', 'Cold Outreach',
    'Pipeline Management', 'Sales Forecasting', 'Closing', 'Quota Attainment',
    'Negotiation|Commercial Negotiation', 'Deal Structuring', 'Territory Management',
    'SaaS Sales', 'Client Acquisition', 'Revenue Growth',
  ],
  'Account Management & Customer Success': [
    'Account Management', 'Key Account Management', 'Customer Success',
    'Client Relationship Management|Relationship Building|Client Relations',
    'Customer Retention', 'Upselling', 'Cross-selling', 'Renewals',
    'Onboarding', 'Quarterly Business Reviews|QBR', 'Customer Advocacy',
    'Net Revenue Retention|NRR', 'Escalation Management',
  ],
  'Sales Operations & Enablement': [
    'Sales Operations|Sales Ops', 'Sales Enablement', 'CRM', 'Salesforce',
    'Zoho CRM', 'Pipedrive', 'Outreach.io', 'Salesloft', 'Apollo.io',
    'Sales Analytics', 'Commission Planning', 'Sales Training', 'Playbook Development',
    'Revenue Operations|RevOps', 'Lead Scoring', 'Territory Design',
  ],
  'Partnerships & Alliances': [
    'Partnerships|Strategic Partnership Development|Strategic Partnerships',
    'Channel Partnerships', 'Alliances', 'Partner Management',
    'Business Alliances', 'Reseller Management', 'Ecosystem Development',
  ],
  'Accounting & Reporting': [
    'Accounting', 'Financial Reporting', 'Bookkeeping', 'General Ledger',
    'Accounts Payable|AP', 'Accounts Receivable|AR', 'Reconciliation',
    'Month-End Close', 'IFRS', 'GAAP|US GAAP', 'Ind AS', 'Consolidation',
    'Tally', 'QuickBooks', 'SAP FICO', 'NetSuite', 'Xero',
  ],
  'Financial Planning & Analysis': [
    'Profitability Analysis', 'Revenue Forecasting', 
    'Financial Planning & Analysis|FP&A', 'Financial Modeling|Financial Modelling',
    'Financial Analysis', 'Budgeting', 'Forecasting & Planning', 'Variance Analysis',
    'Unit Economics', 'P&L Management|P&L Ownership', 'Cost Analysis',
    'Scenario Planning', 'Business Case Development', 'KPI Reporting',
    'Cash Flow Analysis', 'Margin Analysis',
  ],
  'Investment & Capital Markets': [
    'Derivatives', 'CFA', 'Fixed Income', 'Equity Analysis', 'Financial Markets', 
    'Investment Banking', 'Private Equity', 'Venture Capital|VC', 'Equity Research',
    'Valuation|DCF|Discounted Cash Flow', 'M&A|Mergers & Acquisitions',
    'Due Diligence', 'Fundraising', 'Capital Markets', 'Portfolio Management',
    'Deal Sourcing', 'LBO Modeling', 'Term Sheets', 'Cap Table Management',
    'Trading', 'Asset Management', 'Wealth Management',
  ],
  'Tax, Audit & Controls': [
    'Taxation|Tax', 'Direct Tax', 'Indirect Tax', 'GST', 'Transfer Pricing',
    'Internal Audit', 'External Audit', 'Statutory Audit', 'Internal Controls',
    'SOX Compliance', 'Forensic Accounting',
  ],
  'Treasury & Risk': [
    'Value at Risk|VaR|VaR Estimation', 'Historical Simulation', 'EWMA', 'Stress Testing', 
    'Treasury Management', 'Risk Management', 'Credit Risk', 'Market Risk',
    'Operational Risk', 'Liquidity Management', 'Hedging', 'Insurance',
    'Basel Norms', 'Underwriting', 'Credit Analysis', 'Fraud Detection',
  ],
  'Talent Acquisition': [
    'Recruiting|Recruitment', 'Technical Recruiting', 'Talent Acquisition',
    'Sourcing|Candidate Sourcing', 'Boolean Search', 'Interviewing',
    'Candidate Experience', 'Employer Branding', 'Campus Hiring',
    'Executive Search', 'Applicant Tracking Systems|ATS', 'Offer Negotiation',
    'Headhunting', 'Talent Pipelining', 'Diversity Hiring',
  ],
  'People Operations': [
    'Human Resources|HR', 'People Operations|People Ops', 'HR Operations',
    'HRIS', 'Workday', 'SuccessFactors', 'BambooHR', 'Onboarding & Induction',
    'Employee Engagement', 'Employee Relations', 'Performance Management',
    'HR Policy', 'Labour Law|Employment Law', 'Attrition Management',
    'Organizational Design', 'Workforce Planning', 'HR Analytics',
    'Exit Management', 'Grievance Handling',
  ],
  'Learning & Development': [
    'Learning & Development|L&D', 'Training & Development', 'Instructional Design',
    'Curriculum Development', 'Coaching', 'Mentoring|Mentorship',
    'Leadership Development', 'Capability Building', 'Onboarding Programs',
    'Facilitation', 'E-Learning', 'LMS',
  ],
  'Compensation & Benefits': [
    'Compensation & Benefits|Comp & Ben', 'Payroll', 'Payroll Management',
    'Global Payroll', 'Benefits Administration', 'Equity Compensation|ESOP',
    'Salary Benchmarking', 'Job Architecture', 'Incentive Design',
    'Global Payments',
  ],
  'Business Operations & Strategy': [
    'Business Operations|BizOps', 'Operations Management', 'Strategy|Strategic Planning',
    'Corporate Strategy', 'Consulting|Management Consulting', 'Business Strategy',
    'Business Analysis', 'Operational Excellence', 'Process Optimization',
    'Cost Optimization', 'Revenue Operations', 'Business Planning',
    'Market Entry Strategy', 'Growth Strategy', 'Benchmarking',
    'Problem Solving|Problem-solving|Structured Problem Solving',
    'Analytical Thinking|Analytical Skills', 'Critical Thinking', 'Creative Thinking',
    'Decision Making', 'Data-Driven Decision Making', 'Automation|AI/LLM-Powered Automation',
  ],
  'Supply Chain & Logistics': [
    'Supply Chain Management|Supply Chain', 'Logistics', 'Shipping',
    'Warehouse Management', 'Inventory Management', 'Demand Planning',
    'Supply Planning', 'Distribution', 'Last Mile Delivery', 'Freight Management',
    'Transportation Management', 'Route Optimization', 'Fleet Management',
    'Customs & Trade Compliance', 'Import/Export', 'S&OP',
    'Total Logistics Cost assessment|Logistics Cost Analysis',
    'Vendor & Supply-Chain Partnerships', 'Network Design', 'Order Management',
  ],
  'Manufacturing & Quality': [
    'Manufacturing', 'Production Planning', 'Lean Manufacturing|Lean',
    'Six Sigma|Lean Six Sigma', 'Kaizen', '5S', 'Quality Control|QC',
    'Quality Management|QMS', 'ISO 9001', 'Root Cause Analysis (Manufacturing)',
    'Process Engineering', 'Industrial Engineering', 'Plant Operations',
    'Maintenance Management', 'Safety Management|EHS',
  ],
  'Procurement & Vendor Management': [
    'Procurement', 'Sourcing & Procurement', 'Vendor Management',
    'Supplier Management', 'Contract Negotiation', 'Category Management',
    'Cost Negotiation', 'RFP Management|RFQ', 'Spend Analysis',
    'Supplier Evaluation', 'Purchase Order Management',
  ],
  'Customer Support Operations': [
    'Customer Support', 'Customer Service', 'Technical Support',
    'Helpdesk', 'Zendesk', 'Freshdesk', 'Intercom', 'Ticket Management',
    'SLA Management', 'Call Center Operations', 'Support Escalation',
    'Knowledge Base Management', 'Customer Satisfaction|CSAT', 'NPS',
  ],
  'Legal & Compliance': [
    'Legal', 'Contract Law', 'Contract Drafting', 'Corporate Law',
    'Intellectual Property|IP', 'Patents', 'Trademarks', 'Litigation',
    'Regulatory Compliance|Compliance', 'Data Privacy|GDPR|Privacy Law',
    'Corporate Governance', 'Anti-Money Laundering|AML', 'KYC',
    'Legal Research', 'Contract Management',
  ],
  'Healthcare & Life Sciences': [
    'Clinical Research', 'Clinical Trials', 'Pharmacovigilance',
    'Regulatory Affairs', 'Medical Writing', 'Bioinformatics',
    'Healthcare Operations', 'Patient Care', 'Medical Coding',
    'Drug Discovery', 'Genomics', 'Biotechnology', 'Public Health', 'Nursing',
  ],
  'Research & Science': [
    'Computational Neuroscience', 'EEG Processing', 'Brain Computer Interface|BCI', 'Neuroscience', 
    'Research', 'Academic Research|Graduate Research', 'Literature Review',
    'Experimental Design', 'Scientific Writing', 'Data Collection & Analysis',
    'Qualitative Research', 'Quantitative Research', 'Survey Design',
    'Publication', 'Grant Writing', 'Physics', 'Chemistry', 'Biology',
    'Mathematics', 'Technology Development',
  ],
  'Education & Training': [
    'Teaching', 'Lecturing', 'Tutoring', 'Curriculum Design',
    'Classroom Management', 'Student Mentoring', 'Assessment Design',
    'Academic Advising', 'Educational Technology|EdTech',
  ],
  'Industry Domains': [
    'FinTech', 'Banking & Payments|Payments', 'AdTech', 'E-commerce|Ecommerce',
    'SaaS', 'Marketplaces', 'HealthTech', 'EdTech Domain', 'InsurTech',
    'Enterprise Technology|Enterprise Software', 'Telecom', 'Retail',
    'Real Estate', 'Hospitality', 'Automotive', 'Energy', 'Aviation',
    'Media & Entertainment', 'Gaming Industry', 'Agritech', 'Logistics Tech',
  ],
  'Leadership & Management': [
    'Leadership', 'Team Management', 'People Management', 'Engineering Leadership',
    'Team Building', 'Hiring & Team Scaling', 'Delegation', 'Strategic Leadership',
    'Executive Leadership', 'Conflict Resolution', 'Performance Reviews',
    'Cross-Functional Management', 'Culture Building', 'Motivation',
    'Engineering efficiency measurement', 'Ownership', 'Accountability',
  ],
  'Communication & Collaboration': [
    'Communication|Communication Skills', 'Written Communication',
    'Verbal Communication', 'Presentation Skills', 'Public Speaking',
    'Teamwork|Team Work', 'Collaboration', 'Active Listening',
    'Interpersonal Skills', 'Emotional Intelligence', 'Empathy',
    'Time Management', 'Adaptability|Flexibility', 'Attention to Detail',
    'Work Ethic', 'Self-Motivation', 'Multitasking', 'Organization Skills',
    'Client Communication', 'Stakeholder Communication',
  ],
  'Spoken Languages': [
    'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi',
    'Bengali', 'Gujarati', 'Punjabi', 'Urdu', 'Odia', 'Assamese',
    'Spanish', 'French', 'German', 'Mandarin|Chinese', 'Japanese', 'Korean',
    'Portuguese', 'Italian', 'Russian', 'Arabic', 'Dutch', 'Hebrew',
  ],
  'Additional Skills': [],
}
